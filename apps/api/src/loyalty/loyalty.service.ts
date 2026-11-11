import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { EntitlementsService } from '../billing/entitlements.service';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService, private entitlements: EntitlementsService) {}

  /** Crédite les points d'une prestation terminée. Idempotent : une prestation ne rapporte qu'une fois. */
  async award(salonId: string, clientId: string | null, priceMad: number, refType: 'APPOINTMENT' | 'TICKET', refId: string) {
    if (!clientId) return 0;
    const program = await this.prisma.loyaltyProgram.findUnique({ where: { salonId } });
    if (!program?.enabled || !(await this.entitlements.features(salonId)).loyalty) return 0;
    const points = program.pointsPerVisit + Math.floor(priceMad / 10) * program.pointsPer10Mad;
    if (points <= 0) return 0;
    try {
      await this.prisma.loyaltyTransaction.create({ data: { salonId, clientId, points, reason: 'EARN', refType, refId } });
      return points;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 0;
      throw e;
    }
  }

  async balance(salonId: string, clientId: string, tx: Prisma.TransactionClient = this.prisma) {
    const agg = await tx.loyaltyTransaction.aggregate({ where: { salonId, clientId }, _sum: { points: true } });
    return agg._sum.points ?? 0;
  }

  /** Vue client : solde, récompenses et bons en attente, salon par salon. */
  async overview(clientId: string) {
    const groups = await this.prisma.loyaltyTransaction.groupBy({ by: ['salonId'], where: { clientId }, _sum: { points: true } });
    const salonIds = groups.map((g) => g.salonId);
    const [salons, rewards, redemptions, history] = await Promise.all([
      this.prisma.salon.findMany({ where: { id: { in: salonIds } }, select: { id: true, name: true, slug: true, logoUrl: true } }),
      this.prisma.loyaltyReward.findMany({ where: { salonId: { in: salonIds }, active: true }, orderBy: { pointsCost: 'asc' } }),
      this.prisma.loyaltyRedemption.findMany({ where: { clientId, status: 'PENDING' }, include: { reward: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.loyaltyTransaction.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return groups.map((g) => ({
      salon: salons.find((s) => s.id === g.salonId),
      balance: g._sum.points ?? 0,
      rewards: rewards.filter((r) => r.salonId === g.salonId),
      redemptions: redemptions.filter((r) => r.salonId === g.salonId),
      history: history.filter((h) => h.salonId === g.salonId),
    })).filter((x) => x.salon);
  }

  /** Échange des points contre une récompense : génère un bon que le professionnel validera en salon. */
  async redeem(clientId: string, rewardId: string) {
    const reward = await this.prisma.loyaltyReward.findFirst({ where: { id: rewardId, active: true } });
    if (!reward) throw notFound('Récompense');
    return this.prisma.$transaction(async (tx) => {
      // Verrou par client et par salon : deux échanges simultanés ne peuvent pas dépenser deux fois les mêmes points.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:${reward.salonId}:${clientId}`}))`;
      if ((await this.balance(reward.salonId, clientId, tx)) < reward.pointsCost) {
        throw badRequest('NOT_ENOUGH_POINTS', 'Solde de points insuffisant');
      }
      const redemption = await tx.loyaltyRedemption.create({
        data: { salonId: reward.salonId, clientId, rewardId, code: randomBytes(4).toString('hex').toUpperCase() },
        include: { reward: true },
      });
      await tx.loyaltyTransaction.create({
        data: { salonId: reward.salonId, clientId, points: -reward.pointsCost, reason: 'REDEEM', refType: 'REDEMPTION', refId: redemption.id },
      });
      return redemption;
    });
  }
}
