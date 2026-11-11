import { Injectable } from '@nestjs/common';
import { forbidden } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

/** Fonctionnalités et limites d'un plan. Stockées en JSON : un plan se modifie sans toucher au code. */
export interface PlanFeatures {
  maxStaff: number;
  maxPhotos: number;
  customBranding: boolean;
  statistics: boolean;
  advancedStatistics: boolean;
  loyalty: boolean;
  groupBooking: boolean;
}

/** Droits appliqués tant qu'aucun abonnement n'est actif (configuration du salon en brouillon). */
export const BASE_FEATURES: PlanFeatures = {
  maxStaff: 1, maxPhotos: 3, customBranding: false, statistics: false,
  advancedStatistics: false, loyalty: false, groupBooking: false,
};

@Injectable()
export class EntitlementsService {
  constructor(private prisma: PrismaService) {}

  async activeSubscription(salonId: string) {
    return this.prisma.subscription.findFirst({
      where: { salonId, status: 'ACTIVE', endsAt: { gt: new Date() } },
      include: { plan: true }, orderBy: { endsAt: 'desc' },
    });
  }

  async features(salonId: string): Promise<PlanFeatures> {
    const sub = await this.activeSubscription(salonId);
    return { ...BASE_FEATURES, ...((sub?.plan.features as object) ?? {}) };
  }

  async require(salonId: string, feature: keyof PlanFeatures) {
    const f = await this.features(salonId);
    if (!f[feature]) throw forbidden('PLAN_FEATURE', "Cette fonctionnalité n'est pas incluse dans votre abonnement");
    return f;
  }
}
