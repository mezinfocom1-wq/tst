import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import { Public } from './common/auth';
import { PrismaService } from './common/prisma.service';
import { ZONE } from './common/tz';

const DAY = 86_400_000;
const offsetAt = (ts: number) => DateTime.fromMillis(ts, { zone: ZONE }).offset;

/** Changements de décalage UTC du fuseau entre deux instants, à la minute près. */
export function zoneTransitions(from: number, to: number) {
  const out = [{ at: from, offsetMin: offsetAt(from) }];
  for (let t = from; t < to; t += DAY / 4) {
    const next = t + DAY / 4;
    if (offsetAt(next) === offsetAt(t)) continue;
    let lo = t, hi = next;
    while (hi - lo > 60_000) {
      const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
      if (offsetAt(mid) === offsetAt(t)) lo = mid; else hi = mid;
    }
    out.push({ at: hi, offsetMin: offsetAt(hi) });
  }
  return out;
}

@Controller()
export class HealthController {
  private zoneCache: { day: number; body: object } | null = null;

  constructor(private prisma: PrismaService) {}

  @Public() @SkipThrottle() @Get('health')
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }

  /**
   * Décalages horaires du Maroc sur une fenêtre glissante (un an en arrière, deux ans en avant).
   * Le serveur est la référence : un appareil dont la base de fuseaux est périmée affiche quand même la bonne heure.
   */
  @Public() @SkipThrottle() @Header('cache-control', 'public, max-age=3600') @Get('meta/timezone')
  timezone() {
    const today = Math.floor(Date.now() / DAY);
    if (this.zoneCache?.day !== today) {
      this.zoneCache = { day: today, body: { zone: ZONE, transitions: zoneTransitions((today - 366) * DAY, (today + 731) * DAY) } };
    }
    return this.zoneCache.body;
  }
}
