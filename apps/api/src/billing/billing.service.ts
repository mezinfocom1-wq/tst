import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { DateTime } from 'luxon';
import { ZONE } from '../common/tz';
import { NotificationsService } from '../notifications/notifications.service';

const fmtDate = (d: Date) => DateTime.fromJSDate(d, { zone: ZONE }).toFormat('dd/LL/yyyy');

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private audit: AuditService) {}

  /** Le professionnel choisit une formule : crée un abonnement et un paiement « en attente ». Rien n'est activé. */
  async subscribe(salonId: string, planId: string, actorId: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, active: true } });
    if (!plan) throw notFound('Formule');
    const toVerify = await this.prisma.payment.count({ where: { salonId, status: 'TO_VERIFY' } });
    if (toVerify) throw conflict('PAYMENT_IN_REVIEW', 'Un paiement est déjà en cours de vérification');
    // Une demande précédente non payée est remplacée par la nouvelle.
    await this.prisma.subscription.updateMany({ where: { salonId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const sub = await this.prisma.subscription.create({
      data: { salonId, planId, payments: { create: { salonId, amountMad: plan.priceMad } } },
      include: { payments: true, plan: true },
    });
    await this.audit.log({ actorId, action: 'billing.subscribe', entityType: 'Subscription', entityId: sub.id, salonId, meta: { plan: plan.code } });
    return sub;
  }

  /** Dépôt de la preuve : le paiement passe « à vérifier ». L'abonnement reste inactif. */
  async submitProof(salonId: string, paymentId: string, reference: string, proofKey: string, actorId: string) {
    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, salonId, status: { in: ['PENDING', 'REJECTED'] }, subscription: { status: 'PENDING' } },
      data: { status: 'TO_VERIFY', reference, proofKey, adminNote: null },
    });
    if (!count) throw badRequest('BAD_STATUS', 'Ce paiement ne peut plus recevoir de preuve');
    await this.audit.log({ actorId, action: 'billing.proof_submitted', entityType: 'Payment', entityId: paymentId, salonId });
    const salon = await this.prisma.salon.findUnique({ where: { id: salonId }, select: { name: true } });
    await this.notifications.notifyAdmins('paiement à vérifier', `${salon?.name} — réf. ${reference}`);
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  /** Validation manuelle par le Super Admin : seul ce geste active un abonnement. */
  async validate(paymentId: string, adminId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('receipt-number'))`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { subscription: { include: { plan: true, salon: true } } } });
      if (!payment) throw notFound('Paiement');
      if (payment.status !== 'TO_VERIFY') throw conflict('BAD_STATUS', "Ce paiement n'est pas en attente de vérification");
      const now = new Date();
      const { plan, salonId, salon } = payment.subscription;
      const current = await tx.subscription.findFirst({
        where: { salonId, status: 'ACTIVE', endsAt: { gt: now } }, orderBy: { endsAt: 'desc' },
      });
      // Renouvellement de la même formule : la nouvelle période commence à la fin de l'actuelle.
      // Changement de formule : la nouvelle remplace immédiatement l'ancienne.
      let startsAt = now;
      if (current && current.planId === plan.id) startsAt = current.endsAt!;
      else if (current) await tx.subscription.update({ where: { id: current.id }, data: { status: 'CANCELLED', cancelledAt: now } });
      const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86_400_000);
      const year = DateTime.fromJSDate(now, { zone: ZONE }).year;
      const seq = (await tx.payment.count({ where: { receiptNumber: { startsWith: `R-${year}-` } } })) + 1;
      const receiptNumber = `R-${year}-${String(seq).padStart(5, '0')}`;
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'VALIDATED', reviewedById: adminId, reviewedAt: now, receiptNumber } });
      await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { status: 'ACTIVE', startsAt, endsAt, expiryNotifiedAt: null } });
      return { salon, plan, endsAt, receiptNumber, salonId };
    });
    await this.audit.log({ actorId: adminId, action: 'billing.payment_validated', entityType: 'Payment', entityId: paymentId, salonId: result.salonId, meta: { receipt: result.receiptNumber } });
    await this.notifications.notify(result.salon.ownerId, 'payment_validated', { plan: result.plan.name, until: fmtDate(result.endsAt), receipt: result.receiptNumber });
    return { ok: true, receiptNumber: result.receiptNumber, endsAt: result.endsAt };
  }

  async reject(paymentId: string, adminId: string, note: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { subscription: { include: { salon: true } } } });
    if (!payment) throw notFound('Paiement');
    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'TO_VERIFY' }, data: { status: 'REJECTED', adminNote: note, reviewedById: adminId, reviewedAt: new Date() },
    });
    if (!count) throw conflict('BAD_STATUS', "Ce paiement n'est pas en attente de vérification");
    await this.audit.log({ actorId: adminId, action: 'billing.payment_rejected', entityType: 'Payment', entityId: paymentId, salonId: payment.salonId, meta: { note } });
    await this.notifications.notify(payment.subscription.salon.ownerId, 'payment_rejected', { note });
    return { ok: true };
  }

  /** Annulation : l'abonnement actif court jusqu'à son terme et ne sera pas renouvelé ; une demande en attente est abandonnée. */
  async cancel(salonId: string, actorId: string) {
    const now = new Date();
    await this.prisma.subscription.updateMany({ where: { salonId, status: 'PENDING', payments: { none: { status: 'TO_VERIFY' } } }, data: { status: 'CANCELLED', cancelledAt: now } });
    await this.prisma.subscription.updateMany({ where: { salonId, status: 'ACTIVE', cancelledAt: null }, data: { cancelledAt: now } });
    await this.audit.log({ actorId, action: 'billing.cancelled', salonId });
    return { ok: true };
  }

  /** Tâche planifiée : expiration des abonnements et avertissement sept jours avant l'échéance. */
  async runExpiry() {
    const now = new Date();
    const expired = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', endsAt: { lte: now } }, include: { plan: true, salon: { select: { ownerId: true, id: true } } },
    });
    for (const s of expired) {
      await this.prisma.subscription.update({ where: { id: s.id }, data: { status: 'EXPIRED' } });
      const stillActive = await this.prisma.subscription.count({ where: { salonId: s.salonId, status: 'ACTIVE', endsAt: { gt: now } } });
      if (!stillActive) await this.notifications.notify(s.salon.ownerId, 'subscription_expired', { plan: s.plan.name });
    }
    const soon = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', expiryNotifiedAt: null, endsAt: { gt: now, lte: new Date(now.getTime() + 7 * 86_400_000) } },
      include: { plan: true, salon: { select: { ownerId: true } } },
    });
    for (const s of soon) {
      const renewal = await this.prisma.subscription.count({ where: { salonId: s.salonId, status: 'ACTIVE', endsAt: { gt: s.endsAt! } } });
      await this.prisma.subscription.update({ where: { id: s.id }, data: { expiryNotifiedAt: now } });
      if (!renewal) await this.notifications.notify(s.salon.ownerId, 'subscription_expiring', { plan: s.plan.name, until: fmtDate(s.endsAt!) });
    }
    return { expired: expired.length, warned: soon.length };
  }
}
