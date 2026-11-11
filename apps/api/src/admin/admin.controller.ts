import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { badRequest, conflict, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { DEFAULT_SETTINGS, SettingKey, SettingsService } from '../common/settings.service';
import { StorageService } from '../common/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TEMPLATES } from '../notifications/templates';
import { refreshRating } from '../reviews/reviews.controller';
import {
  ApplicationDecisionDto, ComplaintUpdateDto, HideDto, NoteDto, PlanDto, SalonDecisionDto, SettingDto, TemplateDto, UpdatePlanDto, UserStatusDto,
} from './admin.dto';

const paging = (page?: string, size = 50) => ({ take: size, skip: (Math.max(Number(page) || 1, 1) - 1) * size });
const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });
const SALON_STATUS_LABEL: Record<string, string> = {
  APPROVED: 'approuvé', REJECTED: 'refusé', INFO_REQUESTED: 'informations complémentaires demandées', SUSPENDED: 'suspendu',
};

@ApiTags('admin') @ApiBearerAuth() @Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
    private settings: SettingsService,
    private notifications: NotificationsService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  @Get('stats')
  async stats() {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [users, salons, pendingApplications, pendingSalons, paymentsToVerify, activeSubs, revenue, appointments, tickets, openComplaints, signups] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.salon.groupBy({ by: ['status'], _count: true }),
      this.prisma.proApplication.count({ where: { status: 'PENDING' } }),
      this.prisma.salon.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.payment.count({ where: { status: 'TO_VERIFY' } }),
      this.prisma.subscription.findMany({ where: { status: 'ACTIVE', endsAt: { gt: now } }, include: { plan: true } }),
      this.prisma.payment.aggregate({ where: { status: 'VALIDATED', reviewedAt: { gte: since } }, _sum: { amountMad: true } }),
      this.prisma.appointment.count({ where: { createdAt: { gte: since } } }),
      this.prisma.queueTicket.count({ where: { joinedAt: { gte: since } } }),
      this.prisma.complaint.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, COUNT(*) AS count FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    ]);
    return {
      users: Object.fromEntries(users.map((u) => [u.role, u._count])),
      salons: Object.fromEntries(salons.map((s) => [s.status, s._count])),
      todo: { pendingApplications, pendingSalons, paymentsToVerify, openComplaints },
      subscriptions: {
        active: activeSubs.length,
        monthlyRecurringMad: Math.round(activeSubs.reduce((sum, s) => sum + (s.plan.priceMad * 30) / s.plan.durationDays, 0)),
        byPlan: Object.entries(activeSubs.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.plan.name]: (acc[s.plan.name] ?? 0) + 1 }), {}))
          .map(([plan, count]) => ({ plan, count })),
      },
      last30Days: { revenueMad: revenue._sum.amountMad ?? 0, appointments, tickets },
      signups: signups.map((s) => ({ day: s.day, count: Number(s.count) })),
    };
  }

  // ─── Demandes d'accès professionnel ───

  @Get('pro-applications')
  applications(@Query('status') status?: string, @Query('page') page?: string) {
    return this.prisma.proApplication.findMany({
      where: status ? { status: status as never } : {}, orderBy: { createdAt: 'desc' }, ...paging(page),
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, emailVerifiedAt: true, status: true } } },
    });
  }

  @HttpCode(200) @Post('pro-applications/:id/decision')
  async decideApplication(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplicationDecisionDto) {
    const app = await this.prisma.proApplication.findUnique({ where: { id }, include: { user: true } });
    if (!app) throw notFound('Demande');
    if (app.status === 'APPROVED') throw conflict('BAD_STATUS', 'Cette demande est déjà acceptée');
    if (dto.decision !== 'APPROVE' && !dto.note) throw badRequest('NOTE_REQUIRED', 'Un motif est obligatoire');
    const status = ({ APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_INFO: 'INFO_REQUESTED' } as const)[dto.decision];
    await this.prisma.$transaction([
      this.prisma.proApplication.update({ where: { id }, data: { status, adminNote: dto.note ?? null, reviewedById: admin.id, reviewedAt: new Date() } }),
      // Seule l'acceptation par le Super Admin accorde le rôle professionnel.
      ...(dto.decision === 'APPROVE' ? [this.prisma.user.update({ where: { id: app.userId }, data: { role: 'PROFESSIONAL' } })] : []),
    ]);
    await this.audit.log({ actorId: admin.id, action: `application.${status.toLowerCase()}`, entityType: 'ProApplication', entityId: id, meta: { note: dto.note } });
    const key = ({ APPROVE: 'application_approved', REJECT: 'application_rejected', REQUEST_INFO: 'application_info' } as const)[dto.decision];
    await this.notifications.notify(app.userId, key, { firstName: app.user.firstName, note: dto.note ?? '' });
    return { ok: true, status };
  }

  // ─── Salons ───

  @Get('salons')
  async salons(@Query('status') status?: string, @Query('q') q?: string, @Query('page') page?: string) {
    const where: Prisma.SalonWhereInput = { ...(status ? { status: status as never } : {}), ...(q ? { OR: [{ name: contains(q) }, { city: contains(q) }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.salon.findMany({
        where, orderBy: { updatedAt: 'desc' }, ...paging(page),
        include: {
          owner: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
          subscriptions: { where: { status: 'ACTIVE', endsAt: { gt: new Date() } }, include: { plan: { select: { name: true } } }, take: 1 },
          _count: { select: { services: true, staff: true, photos: true } },
        },
      }),
      this.prisma.salon.count({ where }),
    ]);
    return { total, items };
  }

  @HttpCode(200) @Post('salons/:id/decision')
  async decideSalon(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SalonDecisionDto) {
    const salon = await this.prisma.salon.findUnique({ where: { id } });
    if (!salon) throw notFound('Salon');
    const allowed: Record<string, string[]> = {
      APPROVE: ['PENDING_REVIEW', 'INFO_REQUESTED', 'REJECTED'], REJECT: ['PENDING_REVIEW', 'INFO_REQUESTED'],
      REQUEST_INFO: ['PENDING_REVIEW'], SUSPEND: ['APPROVED'], REACTIVATE: ['SUSPENDED'],
    };
    if (!allowed[dto.decision].includes(salon.status)) throw conflict('BAD_STATUS', 'Décision impossible dans le statut actuel du salon');
    if (['REJECT', 'REQUEST_INFO', 'SUSPEND'].includes(dto.decision) && !dto.note) throw badRequest('NOTE_REQUIRED', 'Un motif est obligatoire');
    const status = ({ APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_INFO: 'INFO_REQUESTED', SUSPEND: 'SUSPENDED', REACTIVATE: 'APPROVED' } as const)[dto.decision];
    await this.prisma.salon.update({ where: { id }, data: { status, reviewNote: dto.note ?? null } });
    await this.audit.log({ actorId: admin.id, action: `salon.${dto.decision.toLowerCase()}`, entityType: 'Salon', entityId: id, salonId: id, meta: { note: dto.note } });
    await this.notifications.notify(salon.ownerId, 'salon_status', { salon: salon.name, status: SALON_STATUS_LABEL[status], note: dto.note ?? '' });
    return { ok: true, status };
  }

  // ─── Paiements et abonnements ───

  @Get('payments')
  payments(@Query('status') status?: string, @Query('page') page?: string) {
    return this.prisma.payment.findMany({
      where: status ? { status: status as never } : {}, orderBy: { updatedAt: 'desc' }, ...paging(page), omit: { proofKey: true },
      include: { subscription: { include: { plan: { select: { name: true, durationDays: true } }, salon: { select: { id: true, name: true, city: true, status: true } } } } },
    });
  }

  @Get('payments/:id/proof')
  async proof(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment?.proofKey) throw notFound('Preuve');
    const { buffer, mime } = await this.storage.read(payment.proofKey);
    await this.audit.log({ actorId: admin.id, action: 'billing.proof_viewed', entityType: 'Payment', entityId: id, salonId: payment.salonId });
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }).send(buffer);
  }

  @HttpCode(200) @Post('payments/:id/validate')
  validatePayment(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.validate(id, admin.id);
  }

  @HttpCode(200) @Post('payments/:id/reject')
  rejectPayment(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.billing.reject(id, admin.id, dto.note);
  }

  @Get('subscriptions')
  subscriptions(@Query('status') status?: string, @Query('page') page?: string) {
    return this.prisma.subscription.findMany({
      where: status ? { status: status as never } : {}, orderBy: { createdAt: 'desc' }, ...paging(page),
      include: { plan: { select: { name: true } }, salon: { select: { id: true, name: true, city: true } } },
    });
  }

  @HttpCode(200) @Post('subscriptions/:id/suspend')
  async suspendSubscription(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.subscription.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'SUSPENDED' } });
    if (!count) throw conflict('BAD_STATUS', "Cet abonnement n'est pas actif");
    await this.audit.log({ actorId: admin.id, action: 'billing.subscription_suspended', entityType: 'Subscription', entityId: id });
    return { ok: true };
  }

  @HttpCode(200) @Post('subscriptions/:id/reactivate')
  async reactivateSubscription(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.subscription.updateMany({ where: { id, status: 'SUSPENDED', endsAt: { gt: new Date() } }, data: { status: 'ACTIVE' } });
    if (!count) throw conflict('BAD_STATUS', 'Cet abonnement ne peut pas être réactivé');
    await this.audit.log({ actorId: admin.id, action: 'billing.subscription_reactivated', entityType: 'Subscription', entityId: id });
    return { ok: true };
  }

  // ─── Formules ───

  @Get('plans')
  plans() {
    return this.prisma.plan.findMany({ orderBy: { position: 'asc' }, include: { _count: { select: { subscriptions: true } } } });
  }

  @Post('plans')
  async createPlan(@CurrentUser() admin: AuthUser, @Body() dto: PlanDto) {
    if (await this.prisma.plan.findUnique({ where: { code: dto.code } })) throw conflict('CODE_TAKEN', 'Ce code de formule existe déjà');
    const plan = await this.prisma.plan.create({ data: { ...dto, features: dto.features as Prisma.InputJsonValue } });
    await this.audit.log({ actorId: admin.id, action: 'plan.created', entityType: 'Plan', entityId: plan.id });
    return plan;
  }

  @Patch('plans/:id')
  async updatePlan(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.update({ where: { id }, data: { ...dto, features: dto.features as Prisma.InputJsonValue | undefined } }).catch(() => null);
    if (!plan) throw notFound('Formule');
    await this.audit.log({ actorId: admin.id, action: 'plan.updated', entityType: 'Plan', entityId: id, meta: dto as object });
    return plan;
  }

  /** Une formule déjà souscrite est désactivée (plus proposée) au lieu d'être supprimée. */
  @Delete('plans/:id')
  async removePlan(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const used = await this.prisma.subscription.count({ where: { planId: id } });
    if (used) await this.prisma.plan.update({ where: { id }, data: { active: false } });
    else await this.prisma.plan.deleteMany({ where: { id } });
    await this.audit.log({ actorId: admin.id, action: used ? 'plan.deactivated' : 'plan.deleted', entityType: 'Plan', entityId: id });
    return { ok: true, deactivated: !!used };
  }

  // ─── Utilisateurs ───

  @Get('users')
  async users(@Query('role') role?: string, @Query('q') q?: string, @Query('page') page?: string) {
    const where: Prisma.UserWhereInput = {
      ...(role ? { role: role as never } : {}),
      ...(q ? { OR: [{ email: contains(q) }, { firstName: contains(q) }, { lastName: contains(q) }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, ...paging(page),
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, status: true, emailVerifiedAt: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { total, items };
  }

  @HttpCode(200) @Post('users/:id/status')
  async setUserStatus(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UserStatusDto) {
    if (id === admin.id) throw badRequest('SELF', 'Vous ne pouvez pas suspendre votre propre compte');
    const user = await this.prisma.user.update({ where: { id }, data: { status: dto.status } }).catch(() => null);
    if (!user) throw notFound('Utilisateur');
    if (dto.status === 'SUSPENDED') {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log({ actorId: admin.id, action: `user.${dto.status.toLowerCase()}`, entityType: 'User', entityId: id });
    return { ok: true };
  }

  // ─── Configuration ───

  @Get('settings')
  getSettings() {
    return this.settings.all();
  }

  @Put('settings/:key')
  async setSetting(@CurrentUser() admin: AuthUser, @Param('key') key: string, @Body() dto: SettingDto) {
    if (!(key in DEFAULT_SETTINGS)) throw notFound('Paramètre');
    if (key === 'ranking') {
      for (const v of Object.values(dto.value)) if (typeof v !== 'number' || v < 0 || v > 1) throw badRequest('BAD_VALUE', 'Les pondérations doivent être comprises entre 0 et 1');
    }
    const value = await this.settings.set(key as SettingKey, dto.value);
    await this.audit.log({ actorId: admin.id, action: 'settings.updated', entityType: 'Setting', entityId: key });
    return value;
  }

  @Get('templates')
  async templates() {
    const overrides = await this.prisma.notificationTemplate.findMany();
    return Object.entries(TEMPLATES).flatMap(([key, tpl]) => (['fr', 'ar'] as const).map((locale) => {
      const o = overrides.find((x) => x.key === key && x.locale === locale);
      return { key, locale, channels: tpl.channels, title: o?.title ?? tpl[locale].title, body: o?.body ?? tpl[locale].body, customized: !!o };
    }));
  }

  @Put('templates/:key/:locale')
  async setTemplate(@CurrentUser() admin: AuthUser, @Param('key') key: string, @Param('locale') locale: string, @Body() dto: TemplateDto) {
    if (!(key in TEMPLATES) || !['fr', 'ar'].includes(locale)) throw notFound('Modèle');
    await this.audit.log({ actorId: admin.id, action: 'template.updated', entityType: 'Template', entityId: `${key}:${locale}` });
    return this.prisma.notificationTemplate.upsert({ where: { key_locale: { key, locale } }, create: { key, locale, ...dto }, update: dto });
  }

  @Delete('templates/:key/:locale')
  async resetTemplate(@Param('key') key: string, @Param('locale') locale: string) {
    await this.prisma.notificationTemplate.deleteMany({ where: { key, locale } });
    return { ok: true };
  }

  // ─── Journaux, réclamations, avis ───

  @Get('audit-logs')
  async auditLogs(@Query('page') page?: string, @Query('action') action?: string) {
    const where = action ? { action: { startsWith: action } } : {};
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...paging(page) }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actors = await this.prisma.user.findMany({ where: { id: { in: items.flatMap((i) => (i.actorId ? [i.actorId] : [])) } }, select: { id: true, email: true } });
    return { total, items: items.map((i) => ({ ...i, actorEmail: actors.find((a) => a.id === i.actorId)?.email ?? null })) };
  }

  @Get('complaints')
  async complaints(@Query('status') status?: string) {
    const items = await this.prisma.complaint.findMany({ where: status ? { status: status as never } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const authors = await this.prisma.user.findMany({ where: { id: { in: items.map((i) => i.authorId) } }, select: { id: true, email: true, firstName: true, lastName: true } });
    return items.map((i) => ({ ...i, author: authors.find((a) => a.id === i.authorId) }));
  }

  @HttpCode(200) @Post('complaints/:id')
  async updateComplaint(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ComplaintUpdateDto) {
    const complaint = await this.prisma.complaint.update({ where: { id }, data: dto }).catch(() => null);
    if (!complaint) throw notFound('Réclamation');
    await this.audit.log({ actorId: admin.id, action: 'complaint.updated', entityType: 'Complaint', entityId: id, meta: { status: dto.status } });
    return complaint;
  }

  @Get('reviews')
  reviews(@Query('page') page?: string) {
    return this.prisma.review.findMany({ orderBy: { createdAt: 'desc' }, ...paging(page), include: { salon: { select: { name: true } } } });
  }

  @HttpCode(200) @Post('reviews/:id/hide')
  async hideReview(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HideDto) {
    const review = await this.prisma.review.update({ where: { id }, data: { hidden: dto.hidden } }).catch(() => null);
    if (!review) throw notFound('Avis');
    await refreshRating(this.prisma, review.salonId);
    await this.audit.log({ actorId: admin.id, action: dto.hidden ? 'review.hidden' : 'review.shown', entityType: 'Review', entityId: id, salonId: review.salonId });
    return review;
  }
}
