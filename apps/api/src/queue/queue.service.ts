import { Injectable } from '@nestjs/common';
import { Prisma, QueueTicket, Salon, Service } from '@prisma/client';
import { Observable, Subject } from 'rxjs';
import { AuditService } from '../common/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { localDay } from '../common/tz';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { publicSalonWhere } from '../salons/salons.service';
import { Interval, earliestFit, fits, subtract } from '../scheduling/intervals';
import { SchedulingService, StaffDay } from '../scheduling/scheduling.service';
import { DurationEstimator, DurationFn } from './estimator';

const MIN = 60_000;
type WaitingTicket = Pick<QueueTicket, 'id' | 'staffId' | 'joinedAt'> & { service: Service };

export interface Estimate {
  ticketId: string;
  position: number;
  peopleAhead: number;
  estimatedStart: Date | null;
  estimatedWaitMin: number | null;
  suggestedStaffId: string | null;
}

@Injectable()
export class QueueService {
  private streams = new Map<string, Subject<{ at: number }>>();

  constructor(
    private prisma: PrismaService,
    private scheduling: SchedulingService,
    private estimator: DurationEstimator,
    private notifications: NotificationsService,
    private loyalty: LoyaltyService,
    private audit: AuditService,
  ) {}

  /** Flux temps réel des changements de file d'un salon (diffusé par SSE). */
  stream(salonId: string): Observable<{ at: number }> {
    if (!this.streams.has(salonId)) this.streams.set(salonId, new Subject());
    return this.streams.get(salonId)!.asObservable();
  }

  /**
   * Simule le passage des tickets en attente dans les créneaux libres de chaque professionnel.
   * Mode hybride : les rendez-vous sont prioritaires, la file remplit les intervalles restants.
   * Un ticket court peut donc passer avant un ticket long qui ne tiendrait pas avant un rendez-vous.
   */
  simulate(days: StaffDay[], tickets: WaitingTicket[], duration: DurationFn, now: number): Estimate[] {
    const lanes = new Map<string, Interval[]>(days.map((d) => [d.staff.id, subtract(d.free, [{ start: 0, end: now }])]));
    const placed = tickets.map((t) => {
      let best: { staffId: string; start: number; end: number } | null = null;
      for (const d of days) {
        if (!d.serviceIds.has(t.service.id) || (t.staffId && t.staffId !== d.staff.id)) continue;
        const length = duration(d.staff.id, t.service) * MIN;
        const start = earliestFit(lanes.get(d.staff.id)!, now, length);
        if (start !== null && (!best || start < best.start)) best = { staffId: d.staff.id, start, end: start + length };
      }
      if (best) lanes.set(best.staffId, subtract(lanes.get(best.staffId)!, [{ start: best.start, end: best.end }]));
      return { ticket: t, best };
    });
    const order = [...placed].sort((a, b) =>
      (a.best?.start ?? Infinity) - (b.best?.start ?? Infinity) || a.ticket.joinedAt.getTime() - b.ticket.joinedAt.getTime());
    return order.map((p, index) => ({
      ticketId: p.ticket.id, position: index + 1, peopleAhead: index,
      estimatedStart: p.best ? new Date(p.best.start) : null,
      estimatedWaitMin: p.best ? Math.max(0, Math.round((p.best.start - now) / MIN)) : null,
      suggestedStaffId: p.best?.staffId ?? null,
    }));
  }

  private waiting(salonId: string, day: string) {
    return this.prisma.queueTicket.findMany({
      where: { salonId, day, status: 'WAITING' }, include: { service: true }, orderBy: { joinedAt: 'asc' },
    });
  }

  async estimates(salonId: string, now = Date.now()) {
    const day = localDay(now);
    const [days, tickets, duration] = await Promise.all([
      this.scheduling.loadDay(salonId, day, now), this.waiting(salonId, day), this.estimator.forSalon(salonId),
    ]);
    return { days, tickets, duration, estimates: this.simulate(days, tickets, duration, now) };
  }

  /** Attente estimée pour un nouveau client qui rejoindrait la file maintenant. */
  async estimateNew(salonId: string, service: Service, staffId?: string | null, now = Date.now()) {
    const { days, tickets, duration } = await this.estimates(salonId, now);
    const ghost = { id: 'new', staffId: staffId ?? null, joinedAt: new Date(now), service };
    const estimate = this.simulate(days, [...tickets, ghost], duration, now).find((e) => e.ticketId === 'new')!;
    return { waiting: tickets.length, estimate };
  }

  async publicStatus(salonId: string, serviceId?: string, staffId?: string) {
    const salon = await this.prisma.salon.findFirst({ where: { id: salonId, ...publicSalonWhere() } });
    if (!salon) throw notFound('Salon');
    const service = await this.prisma.service.findFirst({
      where: { salonId, active: true, ...(serviceId ? { id: serviceId } : {}) }, orderBy: { durationMin: 'asc' },
    });
    if (!salon.queueEnabled || !service) return { enabled: false, onsiteOnly: salon.queueOnsiteOnly, waiting: 0, estimatedWaitMin: null };
    const { waiting, estimate } = await this.estimateNew(salonId, service, staffId);
    return { enabled: true, onsiteOnly: salon.queueOnsiteOnly, waiting, estimatedWaitMin: estimate.estimatedWaitMin };
  }

  // ─── Entrée dans la file ───

  async join(user: { id: string }, salonId: string, dto: { serviceId: string; staffId?: string; qrToken?: string }) {
    const salon = await this.prisma.salon.findFirst({ where: { id: salonId, ...publicSalonWhere() } });
    if (!salon) throw notFound('Salon');
    if (!salon.queueEnabled) throw badRequest('QUEUE_DISABLED', "Ce salon n'utilise pas la file d'attente");
    if (salon.queueOnsiteOnly && dto.qrToken !== salon.qrToken) {
      throw forbidden('QUEUE_ONSITE_ONLY', 'Scannez le QR Code affiché dans le salon pour rejoindre la file');
    }
    const isStaff = await this.prisma.staffMember.count({ where: { salonId, userId: user.id } });
    if (salon.ownerId === user.id || isStaff) throw forbidden('OWN_SALON', 'Vous ne pouvez pas rejoindre la file de votre propre salon');
    return this.create(salon, { clientId: user.id, serviceId: dto.serviceId, staffId: dto.staffId, actorId: user.id });
  }

  /** Création d'un ticket (client connecté, client de passage ajouté par le professionnel, ou réintégration). */
  async create(salon: Salon, input: { clientId?: string | null; guestName?: string; serviceId: string; staffId?: string | null; actorId: string }) {
    const service = await this.prisma.service.findFirst({ where: { id: input.serviceId, salonId: salon.id, active: true } });
    if (!service) throw badRequest('BAD_SERVICE', 'Prestation indisponible');
    if (input.staffId) {
      const ok = await this.prisma.staffService.count({
        where: { staffId: input.staffId, serviceId: service.id, staff: { salonId: salon.id, active: true } },
      });
      if (!ok) throw badRequest('BAD_STAFF', 'Ce professionnel ne réalise pas cette prestation');
    }
    const { estimate } = await this.estimateNew(salon.id, service, input.staffId);
    if (estimate.estimatedStart === null) {
      throw conflict('QUEUE_CLOSED', "Plus de disponibilité aujourd'hui pour cette prestation");
    }
    const day = localDay();
    let ticket: QueueTicket;
    try {
      ticket = await this.prisma.$transaction(async (tx) => {
        // Verrou par salon : la numérotation des tickets reste séquentielle sous forte affluence.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue:${salon.id}`}))`;
        const last = await tx.queueTicket.aggregate({ where: { salonId: salon.id, day }, _max: { number: true } });
        const created = await tx.queueTicket.create({
          data: {
            salonId: salon.id, day, number: (last._max.number ?? 0) + 1, clientId: input.clientId ?? null,
            guestName: input.guestName, serviceId: service.id, staffId: input.staffId ?? null,
            anyStaff: !input.staffId, priceMad: service.priceMad,
          },
        });
        await tx.statusEvent.create({
          data: { salonId: salon.id, entityType: 'TICKET', entityId: created.id, toStatus: 'WAITING', actorId: input.actorId },
        });
        return created;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('ALREADY_IN_QUEUE', 'Vous avez déjà un ticket en cours dans ce salon');
      }
      throw e;
    }
    if (input.clientId) {
      await this.notifications.notify(input.clientId, 'queue_joined',
        { number: ticket.number, salon: salon.name, wait: estimate.estimatedWaitMin }, { ticketId: ticket.id, salonId: salon.id });
    }
    await this.afterChange(salon);
    return this.view(ticket.id);
  }

  // ─── Vues ───

  async view(ticketId: string, clientId?: string) {
    const ticket = await this.prisma.queueTicket.findFirst({
      where: { id: ticketId, ...(clientId ? { clientId } : {}) },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        staff: { select: { id: true, displayName: true } },
        salon: { select: { id: true, name: true, slug: true, address: true, logoUrl: true } },
        review: { select: { id: true } },
      },
    });
    if (!ticket) throw notFound('Ticket');
    const estimate = ticket.status === 'WAITING'
      ? (await this.estimates(ticket.salonId)).estimates.find((e) => e.ticketId === ticket.id) ?? null : null;
    return { ...ticket, estimate };
  }

  async mine(clientId: string) {
    const tickets = await this.prisma.queueTicket.findMany({
      where: { clientId, OR: [{ status: { in: ['WAITING', 'CALLED', 'IN_SERVICE'] } }, { joinedAt: { gt: new Date(Date.now() - 90 * 86_400_000) } }] },
      orderBy: { joinedAt: 'desc' }, take: 30, select: { id: true },
    });
    return Promise.all(tickets.map((t) => this.view(t.id)));
  }

  /** Tableau de bord de la file pour le professionnel. */
  async board(salonId: string, now = Date.now()) {
    const day = localDay(now);
    const [{ days, estimates }, tickets] = await Promise.all([
      this.estimates(salonId, now),
      this.prisma.queueTicket.findMany({
        where: { salonId, day }, orderBy: { joinedAt: 'asc' },
        include: { service: { select: { id: true, name: true, durationMin: true } }, staff: { select: { id: true, displayName: true } } },
      }),
    ]);
    const clients = await this.prisma.user.findMany({
      where: { id: { in: tickets.flatMap((t) => (t.clientId ? [t.clientId] : [])) } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const withInfo = tickets.map((t) => {
      const c = clients.find((x) => x.id === t.clientId);
      return {
        ...t, clientName: c ? `${c.firstName} ${c.lastName}`.trim() : t.guestName ?? 'Client', clientPhone: c?.phone ?? null,
        estimate: estimates.find((e) => e.ticketId === t.id) ?? null,
      };
    });
    const active = withInfo.filter((t) => ['WAITING', 'CALLED', 'IN_SERVICE'].includes(t.status))
      .sort((a, b) => (a.estimate?.position ?? 0) - (b.estimate?.position ?? 0));
    return {
      day,
      waiting: active.filter((t) => t.status === 'WAITING'),
      staff: days.map((d) => ({
        id: d.staff.id, displayName: d.staff.displayName,
        current: active.find((t) => t.staffId === d.staff.id && t.status !== 'WAITING') ?? null,
        nextAppointmentAt: d.appointments.filter((a) => a.end > now).sort((a, b) => a.start - b.start)[0]?.start ?? null,
        working: d.work.some((w) => w.start <= now && now < w.end),
      })),
      history: withInfo.filter((t) => ['DONE', 'NO_SHOW', 'CANCELLED'].includes(t.status)).reverse(),
    };
  }

  // ─── Actions ───

  private async transition(
    salonId: string, ticketId: string, from: QueueTicket['status'][], to: QueueTicket['status'],
    actorId: string, data: Prisma.QueueTicketUncheckedUpdateManyInput = {}, clientId?: string,
  ) {
    const ticket = await this.prisma.queueTicket.findFirst({ where: { id: ticketId, salonId, ...(clientId ? { clientId } : {}) } });
    if (!ticket) throw notFound('Ticket');
    // La condition sur le statut dans la mise à jour évite qu'une même action soit appliquée deux fois.
    const { count } = await this.prisma.queueTicket.updateMany({
      where: { id: ticketId, status: { in: from } }, data: { ...data, status: to },
    });
    if (!count) throw conflict('BAD_STATUS', 'Cette action est impossible dans le statut actuel du ticket');
    await this.prisma.statusEvent.create({
      data: { salonId, entityType: 'TICKET', entityId: ticketId, fromStatus: ticket.status, toStatus: to, actorId },
    });
    return ticket;
  }

  /** Appelle un ticket pour un professionnel, en respectant la priorité des rendez-vous. */
  async call(salon: Salon, actorId: string, staffId: string, opts: { ticketId?: string; force?: boolean } = {}) {
    const now = Date.now();
    const { days, tickets, duration } = await this.estimates(salon.id, now);
    const lane = days.find((d) => d.staff.id === staffId);
    if (!lane) throw notFound('Professionnel');
    const busy = await this.prisma.queueTicket.count({ where: { salonId: salon.id, staffId, status: { in: ['CALLED', 'IN_SERVICE'] } } });
    if (busy) throw conflict('STAFF_BUSY', 'Ce professionnel a déjà un client en cours');

    const eligible = tickets.filter((t) =>
      lane.serviceIds.has(t.service.id) && (!t.staffId || t.staffId === staffId) && (!opts.ticketId || t.id === opts.ticketId));
    if (!eligible.length) throw notFound('Ticket en attente');
    const free = subtract(lane.work.length ? lane.free : [], [{ start: 0, end: now }]);
    const chosen = eligible.find((t) => fits(free, now, now + duration(staffId, t.service) * MIN)) ?? (opts.force ? eligible[0] : null);
    if (!chosen) {
      throw conflict('WOULD_OVERLAP_APPOINTMENT', 'Cette prestation empiéterait sur un rendez-vous ou sur la fin de journée. Confirmez pour forcer.');
    }
    const ticket = await this.transition(salon.id, chosen.id, ['WAITING'], 'CALLED', actorId, { staffId, calledAt: new Date() });
    if (ticket.clientId) {
      await this.notifications.notify(ticket.clientId, 'queue_called',
        { number: ticket.number, salon: salon.name, staff: lane.staff.displayName }, { ticketId: ticket.id, salonId: salon.id });
    }
    await this.afterChange(salon);
    return this.view(ticket.id);
  }

  async start(salon: Salon, actorId: string, ticketId: string) {
    await this.transition(salon.id, ticketId, ['CALLED'], 'IN_SERVICE', actorId, { startedAt: new Date() });
    await this.afterChange(salon);
    return this.view(ticketId);
  }

  async finish(salon: Salon, actorId: string, ticketId: string) {
    const ticket = await this.transition(salon.id, ticketId, ['IN_SERVICE'], 'DONE', actorId, { finishedAt: new Date() });
    const points = await this.loyalty.award(salon.id, ticket.clientId, ticket.priceMad, 'TICKET', ticket.id);
    await this.afterChange(salon);
    return { ...(await this.view(ticketId)), pointsAwarded: points };
  }

  async noShow(salon: Salon, actorId: string, ticketId: string) {
    await this.transition(salon.id, ticketId, ['WAITING', 'CALLED'], 'NO_SHOW', actorId);
    await this.afterChange(salon);
    return this.view(ticketId);
  }

  /** Réintègre en fin de file un client absent à l'appel, si le salon l'autorise. */
  async requeue(salon: Salon, actorId: string, ticketId: string) {
    if (!salon.allowRequeue) throw forbidden('REQUEUE_DISABLED', "Ce salon n'autorise pas la réintégration dans la file");
    const current = await this.prisma.queueTicket.findFirst({ where: { id: ticketId, salonId: salon.id } });
    if (!current) throw notFound('Ticket');
    if (current.day !== localDay()) throw badRequest('TICKET_EXPIRED', "Ce ticket n'est plus valable aujourd'hui");
    await this.transition(salon.id, ticketId, ['NO_SHOW'], 'WAITING', actorId, {
      joinedAt: new Date(), calledAt: null, notifiedNear: false, staffId: current.anyStaff ? null : current.staffId,
    });
    await this.afterChange(salon);
    return this.view(ticketId);
  }

  async cancel(salon: Salon, actorId: string, ticketId: string, byClientId?: string) {
    const ticket = await this.transition(salon.id, ticketId, ['WAITING', 'CALLED'], 'CANCELLED', actorId, {}, byClientId);
    if (!byClientId && ticket.clientId) {
      await this.notifications.notify(ticket.clientId, 'queue_cancelled', { number: ticket.number, salon: salon.name });
    }
    await this.afterChange(salon);
    return this.view(ticketId);
  }

  /** Après chaque changement : diffusion temps réel et notification des clients dont le tour approche. */
  async afterChange(salon: Pick<Salon, 'id' | 'name'>) {
    this.streams.get(salon.id)?.next({ at: Date.now() });
    try {
      const { tickets, estimates } = await this.estimates(salon.id);
      const full = await this.prisma.queueTicket.findMany({
        where: { id: { in: tickets.map((t) => t.id) }, notifiedNear: false, clientId: { not: null } },
      });
      for (const t of full) {
        const e = estimates.find((x) => x.ticketId === t.id);
        if (!e || e.peopleAhead > 1) continue;
        await this.prisma.queueTicket.update({ where: { id: t.id }, data: { notifiedNear: true } });
        await this.notifications.notify(t.clientId!, 'queue_near',
          { number: t.number, salon: salon.name, ahead: e.peopleAhead }, { ticketId: t.id, salonId: salon.id });
      }
    } catch (e) {
      console.error('[queue] afterChange', e);
    }
  }

  /** Tâche planifiée : les tickets des jours précédents encore ouverts sont clôturés. */
  async closeStale() {
    const stale = await this.prisma.queueTicket.updateMany({
      where: { day: { lt: localDay() }, status: { in: ['WAITING', 'CALLED'] } }, data: { status: 'CANCELLED' },
    });
    await this.prisma.queueTicket.updateMany({
      where: { day: { lt: localDay() }, status: 'IN_SERVICE' }, data: { status: 'DONE', finishedAt: new Date() },
    });
    if (stale.count) await this.audit.log({ action: 'queue.stale_closed', meta: { count: stale.count } });
  }
}
