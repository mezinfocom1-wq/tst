import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Salon } from '@prisma/client';
import { EntitlementsService } from '../billing/entitlements.service';
import { CurrentSalon, ProSalon } from '../common/auth';
import { PrismaService } from '../common/prisma.service';
import { ZONE, dayBounds, localDay } from '../common/tz';

@ApiTags('pro') @ApiBearerAuth()
@Controller('pro')
export class ProInsightsController {
  constructor(private prisma: PrismaService, private entitlements: EntitlementsService) {}

  /** Résumé de la journée, disponible pour tous les abonnements. */
  @ProSalon() @Get('dashboard')
  async dashboard(@CurrentSalon() salon: Salon) {
    const day = localDay();
    const [start, end] = dayBounds(day).map((t) => new Date(t));
    const [appointments, tickets, pendingRedemptions] = await Promise.all([
      this.prisma.appointment.findMany({ where: { salonId: salon.id, startAt: { gte: start, lt: end } }, select: { status: true, priceMad: true, startAt: true } }),
      this.prisma.queueTicket.findMany({ where: { salonId: salon.id, day }, select: { status: true, priceMad: true } }),
      this.prisma.loyaltyRedemption.count({ where: { salonId: salon.id, status: 'PENDING' } }),
    ]);
    const active = appointments.filter((a) => !['CANCELLED', 'NO_SHOW'].includes(a.status));
    return {
      day,
      appointmentsToday: active.length,
      upcomingToday: active.filter((a) => a.status === 'CONFIRMED' && a.startAt > new Date()).length,
      waiting: tickets.filter((t) => t.status === 'WAITING').length,
      servedToday: tickets.filter((t) => t.status === 'DONE').length + appointments.filter((a) => a.status === 'COMPLETED').length,
      revenueToday: tickets.filter((t) => t.status === 'DONE').reduce((s, t) => s + t.priceMad, 0)
        + appointments.filter((a) => a.status === 'COMPLETED').reduce((s, a) => s + a.priceMad, 0),
      noShowsToday: tickets.filter((t) => t.status === 'NO_SHOW').length + appointments.filter((a) => a.status === 'NO_SHOW').length,
      pendingRedemptions,
    };
  }

  /** Fichier clients du salon : uniquement les personnes ayant un historique dans CE salon. */
  @ProSalon() @Get('clients')
  async clients(@CurrentSalon() salon: Salon) {
    const rows = await this.prisma.$queryRaw<{ clientId: string; visits: bigint; spent: bigint; lastVisit: Date }[]>`
      SELECT "clientId", COUNT(*) AS visits, COALESCE(SUM("priceMad"), 0) AS spent, MAX(at) AS "lastVisit" FROM (
        SELECT "clientId", "priceMad", "startAt" AS at FROM "Appointment"
          WHERE "salonId" = ${salon.id} AND status = 'COMPLETED' AND "clientId" IS NOT NULL
        UNION ALL
        SELECT "clientId", "priceMad", "joinedAt" FROM "QueueTicket"
          WHERE "salonId" = ${salon.id} AND status = 'DONE' AND "clientId" IS NOT NULL
      ) v GROUP BY "clientId" ORDER BY "lastVisit" DESC LIMIT 500`;
    const ids = rows.map((r) => r.clientId);
    const [users, points] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, phone: true } }),
      this.prisma.loyaltyTransaction.groupBy({ by: ['clientId'], where: { salonId: salon.id, clientId: { in: ids } }, _sum: { points: true } }),
    ]);
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.clientId);
      return {
        id: r.clientId, name: u ? `${u.firstName} ${u.lastName}`.trim() : 'Client', phone: u?.phone ?? null,
        visits: Number(r.visits), spentMad: Number(r.spent), lastVisit: r.lastVisit,
        points: points.find((p) => p.clientId === r.clientId)?._sum.points ?? 0,
      };
    });
  }

  /** Statistiques sur une période. Le détail avancé dépend de l'abonnement. */
  @ProSalon() @Get('stats')
  async stats(@CurrentSalon() salon: Salon, @Query('days') daysRaw?: string) {
    const features = await this.entitlements.require(salon.id, 'statistics');
    const days = Math.min(Math.max(Number(daysRaw) || 30, 7), 365);
    const since = new Date(dayBounds(localDay(Date.now() - (days - 1) * 86_400_000))[0]);
    const id = salon.id;

    const visits = await this.prisma.$queryRaw<{ day: string; visits: bigint; revenue: bigint }[]>`
      SELECT to_char(at AT TIME ZONE 'UTC' AT TIME ZONE ${ZONE}, 'YYYY-MM-DD') AS day, COUNT(*) AS visits, COALESCE(SUM("priceMad"), 0) AS revenue FROM (
        SELECT "priceMad", "startAt" AS at FROM "Appointment" WHERE "salonId" = ${id} AND status = 'COMPLETED' AND "startAt" >= ${since}
        UNION ALL
        SELECT "priceMad", "joinedAt" FROM "QueueTicket" WHERE "salonId" = ${id} AND status = 'DONE' AND "joinedAt" >= ${since}
      ) v GROUP BY 1 ORDER BY 1`;
    const [apptByStatus, ticketByStatus, topServices, rating] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['status'], where: { salonId: id, startAt: { gte: since } }, _count: true }),
      this.prisma.queueTicket.groupBy({ by: ['status'], where: { salonId: id, joinedAt: { gte: since } }, _count: true }),
      this.prisma.$queryRaw<{ name: string; visits: bigint; revenue: bigint }[]>`
        SELECT s.name, COUNT(*) AS visits, COALESCE(SUM(v."priceMad"), 0) AS revenue FROM (
          SELECT "serviceId", "priceMad" FROM "Appointment" WHERE "salonId" = ${id} AND status = 'COMPLETED' AND "startAt" >= ${since}
          UNION ALL
          SELECT "serviceId", "priceMad" FROM "QueueTicket" WHERE "salonId" = ${id} AND status = 'DONE' AND "joinedAt" >= ${since}
        ) v JOIN "Service" s ON s.id = v."serviceId" GROUP BY s.name ORDER BY visits DESC LIMIT 8`,
      this.prisma.review.aggregate({ where: { salonId: id, hidden: false, createdAt: { gte: since } }, _avg: { rating: true }, _count: true }),
    ]);
    const count = (rows: { status: string; _count: number }[], ...statuses: string[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r._count, 0);
    const done = count(apptByStatus, 'COMPLETED') + count(ticketByStatus, 'DONE');
    const noShows = count(apptByStatus, 'NO_SHOW') + count(ticketByStatus, 'NO_SHOW');

    const base = {
      days, since,
      totals: {
        visits: done, revenueMad: visits.reduce((s, v) => s + Number(v.revenue), 0),
        appointments: count(apptByStatus, 'COMPLETED'), queueTickets: count(ticketByStatus, 'DONE'),
        noShows, noShowRate: done + noShows ? Math.round((noShows / (done + noShows)) * 100) : 0,
        cancellations: count(apptByStatus, 'CANCELLED') + count(ticketByStatus, 'CANCELLED'),
        ratingAvg: rating._avg.rating ? Math.round(rating._avg.rating * 10) / 10 : null, reviews: rating._count,
      },
      series: visits.map((v) => ({ day: v.day, visits: Number(v.visits), revenueMad: Number(v.revenue) })),
      topServices: topServices.map((s) => ({ name: s.name, visits: Number(s.visits), revenueMad: Number(s.revenue) })),
      advanced: null as null | object,
    };
    if (!features.advancedStatistics) return base;

    const [byStaff, wait, byHour] = await Promise.all([
      this.prisma.$queryRaw<{ name: string; visits: bigint; revenue: bigint }[]>`
        SELECT m."displayName" AS name, COUNT(*) AS visits, COALESCE(SUM(v."priceMad"), 0) AS revenue FROM (
          SELECT "staffId", "priceMad" FROM "Appointment" WHERE "salonId" = ${id} AND status = 'COMPLETED' AND "startAt" >= ${since}
          UNION ALL
          SELECT "staffId", "priceMad" FROM "QueueTicket" WHERE "salonId" = ${id} AND status = 'DONE' AND "joinedAt" >= ${since} AND "staffId" IS NOT NULL
        ) v JOIN "StaffMember" m ON m.id = v."staffId" GROUP BY 1 ORDER BY revenue DESC`,
      this.prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("startedAt" - "joinedAt")) / 60)::float AS avg FROM "QueueTicket"
        WHERE "salonId" = ${id} AND status = 'DONE' AND "startedAt" IS NOT NULL AND "joinedAt" >= ${since}`,
      this.prisma.$queryRaw<{ hour: number; visits: bigint }[]>`
        SELECT EXTRACT(HOUR FROM at AT TIME ZONE 'UTC' AT TIME ZONE ${ZONE})::int AS hour, COUNT(*) AS visits FROM (
          SELECT "startAt" AS at FROM "Appointment" WHERE "salonId" = ${id} AND status = 'COMPLETED' AND "startAt" >= ${since}
          UNION ALL
          SELECT "joinedAt" FROM "QueueTicket" WHERE "salonId" = ${id} AND status = 'DONE' AND "joinedAt" >= ${since}
        ) v GROUP BY 1 ORDER BY 1`,
    ]);
    base.advanced = {
      byStaff: byStaff.map((s) => ({ name: s.name, visits: Number(s.visits), revenueMad: Number(s.revenue) })),
      avgWaitMin: wait[0]?.avg != null ? Math.round(wait[0].avg) : null,
      byHour: byHour.map((h) => ({ hour: h.hour, visits: Number(h.visits) })),
    };
    return base;
  }
}
