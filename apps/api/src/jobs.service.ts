import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingService } from './billing/billing.service';
import { BookingService } from './booking/booking.service';
import { PrismaService } from './common/prisma.service';
import { QueueService } from './queue/queue.service';

/** Tâches planifiées. Exécutées dans le processus de l'API (une seule instance doit porter ENABLE_JOBS). */
@Injectable()
export class JobsService {
  private log = new Logger('Jobs');
  private enabled = process.env.ENABLE_JOBS !== 'false' && process.env.NODE_ENV !== 'test';

  constructor(
    private bookings: BookingService,
    private billing: BillingService,
    private queue: QueueService,
    private prisma: PrismaService,
  ) {}

  private async run(name: string, fn: () => Promise<unknown>) {
    if (!this.enabled) return;
    try {
      await fn();
    } catch (e) {
      this.log.error(`${name} : ${(e as Error).message}`);
    }
  }

  @Cron('*/5 * * * *')
  reminders() {
    return this.run('rappels', () => this.bookings.sendReminders());
  }

  @Cron('7 * * * *')
  hourly() {
    return this.run('horaire', async () => {
      await this.billing.runExpiry();
      await this.queue.closeStale();
    });
  }

  @Cron('30 3 * * *', { timeZone: 'Africa/Casablanca' })
  cleanup() {
    return this.run('nettoyage', async () => {
      const old = new Date(Date.now() - 7 * 86_400_000);
      await this.prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: old } }] } });
      await this.prisma.emailToken.deleteMany({ where: { expiresAt: { lt: old } } });
    });
  }
}
