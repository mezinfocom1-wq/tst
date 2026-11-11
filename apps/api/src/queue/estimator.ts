import { Injectable } from '@nestjs/common';
import type { Service } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/** Fonction qui donne la durée prévue (minutes) d'une prestation pour un professionnel. */
export type DurationFn = (staffId: string, service: Pick<Service, 'id' | 'durationMin'>) => number;

/**
 * Point d'extension pour l'estimation du temps d'attente.
 * L'implémentation actuelle est un calcul sur l'historique ; un modèle prédictif
 * pourra la remplacer en fournissant la même interface, sans modifier la file d'attente.
 */
export abstract class DurationEstimator {
  abstract forSalon(salonId: string): Promise<DurationFn>;
}

const MIN_SAMPLES = 3;

@Injectable()
export class HistoricalDurationEstimator extends DurationEstimator {
  constructor(private prisma: PrismaService) {
    super();
  }

  /** Durée moyenne réellement constatée par professionnel et par prestation, sur 90 jours. */
  async forSalon(salonId: string): Promise<DurationFn> {
    const rows = await this.prisma.$queryRaw<{ staffId: string; serviceId: string; total: number; n: bigint }[]>`
      SELECT "staffId", "serviceId", SUM(minutes)::float AS total, COUNT(*) AS n FROM (
        SELECT "staffId", "serviceId", EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) / 60 AS minutes
        FROM "QueueTicket"
        WHERE "salonId" = ${salonId} AND status = 'DONE' AND "staffId" IS NOT NULL
          AND "startedAt" IS NOT NULL AND "finishedAt" > now() - interval '90 days'
        UNION ALL
        SELECT "staffId", "serviceId", EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) / 60
        FROM "Appointment"
        WHERE "salonId" = ${salonId} AND status = 'COMPLETED'
          AND "startedAt" IS NOT NULL AND "finishedAt" > now() - interval '90 days'
      ) t GROUP BY 1, 2`;
    const averages = new Map(rows.filter((r) => Number(r.n) >= MIN_SAMPLES).map((r) => [`${r.staffId}:${r.serviceId}`, r.total / Number(r.n)]));
    return (staffId, service) => {
      const avg = averages.get(`${staffId}:${service.id}`);
      if (!avg) return service.durationMin;
      // Bornes de sécurité : un oubli de clôture ne doit pas fausser durablement l'estimation.
      return Math.round(Math.min(Math.max(avg, service.durationMin * 0.5), service.durationMin * 2));
    };
  }
}
