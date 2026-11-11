import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma, Salon } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { formatLocal, localDay } from '../common/tz';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../queue/queue.service';
import { publicSalonWhere } from '../salons/salons.service';
import { SchedulingService } from '../scheduling/scheduling.service';

export interface BookingInput {
  items: { serviceId: string; staffId?: string; personName?: string }[];
  startAt: string;
  mode?: 'CONSECUTIVE' | 'PARALLEL';
  note?: string;
  idempotencyKey?: string;
  guestName?: string;
  guestPhone?: string;
}

const include = {
  appointments: {
    orderBy: { startAt: 'asc' as const },
    include: { service: { select: { id: true, name: true, durationMin: true } }, staff: { select: { id: true, displayName: true } } },
  },
};

/** Transitions de statut autorisées pour un rendez-vous. */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  CONFIRMED: ['CHECKED_IN', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const isOverlapError = (e: unknown) => {
  const text = `${(e as Error)?.message ?? ''} ${JSON.stringify((e as { meta?: unknown })?.meta ?? '')}`;
  // 23P01 : violation de la contrainte d'exclusion. 40P01 : interblocage résolu par PostgreSQL au détriment de cette demande.
  return text.includes('Appointment_no_overlap') || text.includes('23P01') || text.includes('40P01');
};

@Injectable()
export class BookingService {
  constructor(
    private prisma: PrismaService,
    private scheduling: SchedulingService,
    private settings: SettingsService,
    private entitlements: EntitlementsService,
    private notifications: NotificationsService,
    private loyalty: LoyaltyService,
    private queue: QueueService,
    private audit: AuditService,
  ) {}

  /** Réservation par un client depuis la marketplace. */
  async createForClient(user: { id: string; emailVerified: boolean }, salonId: string, input: BookingInput) {
    const salon = await this.prisma.salon.findFirst({ where: { id: salonId, ...publicSalonWhere() } });
    if (!salon) throw notFound('Salon');
    if (!salon.bookingEnabled) throw badRequest('BOOKING_DISABLED', 'Ce salon ne prend pas de rendez-vous en ligne');
    if ((await this.settings.get('general')).requireEmailVerification && !user.emailVerified) {
      throw forbidden('EMAIL_NOT_VERIFIED', 'Confirmez votre adresse email pour réserver');
    }
    const isStaff = await this.prisma.staffMember.count({ where: { salonId, userId: user.id } });
    if (salon.ownerId === user.id || isStaff) throw forbidden('OWN_SALON', 'Vous ne pouvez pas réserver dans votre propre salon');
    if (new Date(input.startAt).getTime() < Date.now() + salon.bookingLeadMin * 60_000 - 60_000) {
      throw badRequest('TOO_SOON', `Réservez au moins ${salon.bookingLeadMin} minutes à l'avance, ou rejoignez la file d'attente`);
    }
    if (input.items.length > 1 && !(await this.entitlements.features(salonId)).groupBooking) {
      throw forbidden('PLAN_FEATURE', "Ce salon n'accepte pas les réservations de groupe");
    }
    const booking = await this.create(salon, { ...input, guestName: undefined, guestPhone: undefined }, user.id, user.id);
    if (booking.created) {
      const vars = {
        salon: salon.name, when: formatLocal(booking.appointments[0].startAt),
        services: booking.appointments.map((a) => a.service.name).join(', '),
      };
      await this.notifications.notify(user.id, 'booking_confirmed', vars, { bookingId: booking.id, salonId });
      const client = await this.prisma.user.findUnique({ where: { id: user.id } });
      await this.notifications.notify(salon.ownerId, 'pro_new_booking',
        { ...vars, client: `${client?.firstName ?? ''} ${client?.lastName ?? ''}`.trim() }, { bookingId: booking.id });
    }
    return booking;
  }

  /**
   * Crée une réservation (une ou plusieurs prestations) de façon atomique.
   * Toutes les lignes sont insérées dans une seule transaction : si un seul créneau est
   * indisponible, rien n'est créé. La contrainte d'exclusion de la base garantit l'absence
   * de double réservation même si deux demandes arrivent au même instant.
   */
  async create(salon: Salon, input: BookingInput, clientId: string | null, actorId: string) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
      if (existing) {
        if (existing.salonId !== salon.id || existing.createdById !== actorId) throw conflict('IDEMPOTENCY_MISMATCH', 'Clé déjà utilisée');
        return { ...existing, created: false };
      }
    }
    const start = new Date(input.startAt).getTime();
    if (!Number.isFinite(start)) throw badRequest('BAD_DATE', 'Date invalide');
    const services = await this.prisma.service.findMany({ where: { salonId: salon.id, active: true, id: { in: input.items.map((i) => i.serviceId) } } });
    const items = input.items.map((i) => {
      const service = services.find((s) => s.id === i.serviceId);
      if (!service) throw badRequest('BAD_SERVICE', 'Prestation indisponible');
      return { service, staffId: i.staffId, personName: i.personName };
    });
    const days = await this.scheduling.loadDay(salon.id, localDay(start));
    const planned = this.scheduling.plan(days, items, start, input.mode ?? 'CONSECUTIVE');
    if (!planned) throw conflict('SLOT_UNAVAILABLE', "Ce créneau n'est plus disponible");

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        // Verrou par professionnel, pris dans un ordre fixe : les demandes concurrentes sur un même
        // professionnel passent une par une, ce qui évite tout interblocage entre transactions.
        for (const staffId of [...new Set(planned.map((p) => p.staffId))].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff:${staffId}`}))`;
        }
        const created = await tx.booking.create({
          data: {
            salonId: salon.id, clientId, guestName: input.guestName, guestPhone: input.guestPhone, createdById: actorId,
            isGroup: planned.length > 1, note: input.note, idempotencyKey: input.idempotencyKey,
            totalPriceMad: planned.reduce((sum, p) => sum + p.service.priceMad, 0),
            totalDurationMin: Math.round((Math.max(...planned.map((p) => p.end)) - start) / 60_000),
            appointments: {
              create: planned.map((p, i) => ({
                salonId: salon.id, staffId: p.staffId, serviceId: p.service.id, clientId,
                personName: items[i].personName, startAt: new Date(p.start), endAt: new Date(p.end), priceMad: p.service.priceMad,
              })),
            },
          },
          include,
        });
        await tx.statusEvent.createMany({
          data: created.appointments.map((a) => ({ salonId: salon.id, entityType: 'APPOINTMENT', entityId: a.id, toStatus: 'CONFIRMED', actorId })),
        });
        return created;
      });
      return { ...booking, created: true };
    } catch (e) {
      if (isOverlapError(e)) throw conflict('SLOT_TAKEN', "Ce créneau vient d'être pris");
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.idempotencyKey) {
        const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
        if (existing) return { ...existing, created: false };
      }
      throw e;
    }
  }

  async mine(clientId: string) {
    return this.prisma.appointment.findMany({
      where: { clientId }, orderBy: { startAt: 'desc' }, take: 100,
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        staff: { select: { id: true, displayName: true } },
        salon: { select: { id: true, name: true, slug: true, address: true, city: true, logoUrl: true, cancelMinHours: true } },
        booking: { select: { id: true, isGroup: true, totalPriceMad: true } },
        review: { select: { id: true, rating: true } },
      },
    });
  }

  private async setStatus(appointmentId: string, salonId: string, to: AppointmentStatus, actorId: string, note?: string) {
    const current = await this.prisma.appointment.findFirst({ where: { id: appointmentId, salonId } });
    if (!current) throw notFound('Rendez-vous');
    if (!TRANSITIONS[current.status].includes(to)) throw conflict('BAD_STATUS', 'Changement de statut impossible');
    const { count } = await this.prisma.appointment.updateMany({
      where: { id: appointmentId, status: current.status },
      data: {
        status: to,
        ...(to === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
        ...(to === 'COMPLETED' ? { finishedAt: new Date() } : {}),
      },
    });
    if (!count) throw conflict('BAD_STATUS', 'Le rendez-vous a changé entre-temps');
    await this.prisma.statusEvent.create({
      data: { salonId, entityType: 'APPOINTMENT', entityId: appointmentId, fromStatus: current.status, toStatus: to, actorId, note },
    });
    return current;
  }

  async cancelByClient(clientId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, clientId }, include: { salon: true } });
    if (!appt) throw notFound('Rendez-vous');
    if (appt.startAt.getTime() - Date.now() < appt.salon.cancelMinHours * 3_600_000) {
      throw badRequest('TOO_LATE_TO_CANCEL', `L'annulation n'est plus possible moins de ${appt.salon.cancelMinHours} h avant le rendez-vous`);
    }
    await this.setStatus(appointmentId, appt.salonId, 'CANCELLED', clientId, 'Annulé par le client');
    await this.notifications.notify(appt.salon.ownerId, 'booking_cancelled', { salon: appt.salon.name, when: formatLocal(appt.startAt) });
    await this.queue.afterChange(appt.salon);
    return { ok: true };
  }

  // ─── Espace professionnel ───

  async listForSalon(salonId: string, from: Date, to: Date) {
    const rows = await this.prisma.appointment.findMany({
      where: { salonId, startAt: { lt: to }, endAt: { gt: from } }, orderBy: { startAt: 'asc' },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        staff: { select: { id: true, displayName: true } },
        booking: { select: { id: true, isGroup: true, guestName: true, guestPhone: true, note: true } },
      },
    });
    const clients = await this.prisma.user.findMany({
      where: { id: { in: rows.flatMap((r) => (r.clientId ? [r.clientId] : [])) } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    return rows.map((r) => {
      const c = clients.find((x) => x.id === r.clientId);
      return {
        ...r,
        clientName: r.personName || (c ? `${c.firstName} ${c.lastName}`.trim() : r.booking.guestName ?? 'Client'),
        clientPhone: c?.phone ?? r.booking.guestPhone ?? null,
      };
    });
  }

  async updateStatusByPro(salon: Salon, actorId: string, appointmentId: string, to: AppointmentStatus) {
    const appt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, salonId: salon.id } });
    if (!appt) throw notFound('Rendez-vous');
    if (to === 'NO_SHOW' && Date.now() < appt.startAt.getTime() + salon.lateToleranceMin * 60_000) {
      throw badRequest('TOLERANCE_NOT_ELAPSED', `Le délai de tolérance de ${salon.lateToleranceMin} minutes n'est pas écoulé`);
    }
    await this.setStatus(appointmentId, salon.id, to, actorId);
    let pointsAwarded = 0;
    if (to === 'COMPLETED') pointsAwarded = await this.loyalty.award(salon.id, appt.clientId, appt.priceMad, 'APPOINTMENT', appt.id);
    if (to === 'CANCELLED' && appt.clientId) {
      await this.notifications.notify(appt.clientId, 'booking_cancelled', { salon: salon.name, when: formatLocal(appt.startAt) });
    }
    await this.audit.log({ actorId, action: `appointment.${to.toLowerCase()}`, entityType: 'Appointment', entityId: appt.id, salonId: salon.id });
    await this.queue.afterChange(salon);
    return { ...(await this.prisma.appointment.findUnique({ where: { id: appointmentId } })), pointsAwarded };
  }

  /** Client arrivé après le délai de tolérance : il est replacé dans la file d'attente si le salon l'autorise. */
  async moveToQueue(salon: Salon, actorId: string, appointmentId: string) {
    if (!salon.allowRequeue || !salon.queueEnabled) throw forbidden('REQUEUE_DISABLED', "Ce salon n'autorise pas la réintégration dans la file");
    const appt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, salonId: salon.id }, include: { booking: true } });
    if (!appt) throw notFound('Rendez-vous');
    if (appt.status !== 'NO_SHOW') throw badRequest('BAD_STATUS', "Seul un rendez-vous marqué « absent » peut être replacé dans la file");
    return this.queue.create(salon, {
      clientId: appt.clientId, guestName: appt.personName ?? appt.booking.guestName ?? undefined,
      serviceId: appt.serviceId, staffId: null, actorId,
    });
  }

  /** Tâche planifiée : rappel envoyé dans les deux heures précédant le rendez-vous. */
  async sendReminders() {
    const now = Date.now();
    const due = await this.prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED', reminderSentAt: null, clientId: { not: null },
        startAt: { gt: new Date(now), lt: new Date(now + 2 * 3_600_000) },
        createdAt: { lt: new Date(now - 30 * 60_000) },
      },
      include: { salon: { select: { name: true } } }, take: 200,
    });
    for (const a of due) {
      const { count } = await this.prisma.appointment.updateMany({ where: { id: a.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
      if (count) await this.notifications.notify(a.clientId!, 'booking_reminder', { salon: a.salon.name, when: formatLocal(a.startAt) }, { appointmentId: a.id });
    }
    return due.length;
  }
}
