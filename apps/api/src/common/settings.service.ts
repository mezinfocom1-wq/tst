import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export const DEFAULT_SETTINGS = {
  general: { requireEmailVerification: true, supportEmail: 'support@example.com', platformName: 'Salonat' },
  bank: {
    bankName: 'À renseigner', accountHolder: 'À renseigner', rib: 'À renseigner',
    instructions: 'Effectuez un virement du montant exact puis déposez la preuve de paiement.',
  },
  /** Pondérations du classement de la marketplace (modifiables par le Super Admin). */
  ranking: { distance: 0.4, rating: 0.4, popularity: 0.1, queueOpen: 0.1 },
};
export type SettingKey = keyof typeof DEFAULT_SETTINGS;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<(typeof DEFAULT_SETTINGS)[K]> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    return { ...DEFAULT_SETTINGS[key], ...((row?.value as object) ?? {}) };
  }

  async all() {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) out[k] = await this.get(k);
    return out as typeof DEFAULT_SETTINGS;
  }

  async set(key: SettingKey, value: Record<string, unknown>) {
    const merged = { ...(await this.get(key)), ...value } as Prisma.InputJsonValue;
    await this.prisma.platformSetting.upsert({
      where: { key }, create: { key, value: merged }, update: { value: merged },
    });
    return merged;
  }
}
