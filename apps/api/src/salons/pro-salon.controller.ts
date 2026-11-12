import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Salon } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentSalon, CurrentUser, ProSalon, Roles } from '../common/auth';
import { config } from '../common/config';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSalonDto, HoursDto, ServiceDto, StaffDto, TimeOffDto, UpdateSalonDto, UpdateServiceDto, UpdateStaffDto } from './salons.dto';

const upload = () => UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }));
type Upload = { buffer: Buffer };

const slugify = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'salon';

@ApiTags('pro') @ApiBearerAuth()
@Controller('pro')
export class ProSalonController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private entitlements: EntitlementsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  // ─── Salon ───

  @Roles('PROFESSIONAL') @Post('salon')
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateSalonDto) {
    if (await this.prisma.salon.findFirst({ where: { ownerId: u.id } })) {
      throw conflict('SALON_EXISTS', 'Vous avez déjà un salon');
    }
    const owner = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const salon = await this.prisma.salon.create({
      data: {
        ownerId: u.id, name: dto.name.trim(), type: dto.type as never, city: dto.city.trim(), address: dto.address ?? '',
        slug: `${slugify(dto.name)}-${randomBytes(3).toString('hex')}`, qrToken: randomBytes(16).toString('base64url'),
        phone: owner.phone,
        staff: {
          create: {
            userId: u.id, isOwner: true, displayName: `${owner.firstName} ${owner.lastName}`.trim(),
            // Horaires par défaut : lundi à samedi, 9 h – 13 h et 15 h – 20 h (modifiables).
            workingHours: {
              create: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
                { salonId: '', weekday, startMin: 540, endMin: 780 },
                { salonId: '', weekday, startMin: 900, endMin: 1200 },
              ]),
            },
          },
        },
        loyalty: { create: {} },
      },
    });
    await this.prisma.workingHour.updateMany({ where: { salonId: '', staff: { salonId: salon.id } }, data: { salonId: salon.id } });
    await this.audit.log({ actorId: u.id, action: 'salon.created', entityType: 'Salon', entityId: salon.id, salonId: salon.id });
    return salon;
  }

  @ProSalon() @Get('salon')
  async get(@CurrentSalon() salon: Salon, @Req() req: { isOwner: boolean }) {
    const [photos, features, subscription, counts] = await Promise.all([
      this.prisma.salonPhoto.findMany({ where: { salonId: salon.id }, orderBy: { position: 'asc' } }),
      this.entitlements.features(salon.id),
      this.entitlements.activeSubscription(salon.id),
      this.prisma.salon.findUnique({ where: { id: salon.id }, select: { _count: { select: { services: true, staff: true } } } }),
    ]);
    return {
      ...salon, photos, features, isOwner: req.isOwner, counts: counts?._count,
      subscription: subscription && { status: subscription.status, endsAt: subscription.endsAt, plan: subscription.plan.name },
      published: salon.status === 'APPROVED' && !!subscription,
      qrUrl: `${config.webUrl}/fr/salons/${salon.slug}/queue?qr=${salon.qrToken}`,
    };
  }

  @ProSalon({ ownerOnly: true }) @Patch('salon')
  async update(@CurrentSalon() salon: Salon, @Body() dto: UpdateSalonDto) {
    if (dto.brandColor) await this.entitlements.require(salon.id, 'customBranding');
    return this.prisma.salon.update({ where: { id: salon.id }, data: { ...dto, type: dto.type as never } });
  }

  /** Soumet le salon à la validation administrative (indépendante du paiement). */
  @ProSalon({ ownerOnly: true }) @HttpCode(200) @Post('salon/submit')
  async submit(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser) {
    if (!['DRAFT', 'INFO_REQUESTED', 'REJECTED'].includes(salon.status)) {
      throw badRequest('BAD_STATUS', 'Ce salon ne peut pas être soumis dans son état actuel');
    }
    const services = await this.prisma.service.count({ where: { salonId: salon.id, active: true } });
    if (!salon.address || !salon.city || !salon.description || !services) {
      throw badRequest('SALON_INCOMPLETE', 'Renseignez la description, l\'adresse, la ville et au moins une prestation');
    }
    const updated = await this.prisma.salon.update({ where: { id: salon.id }, data: { status: 'PENDING_REVIEW', reviewNote: null } });
    await this.audit.log({ actorId: u.id, action: 'salon.submitted', entityType: 'Salon', entityId: salon.id, salonId: salon.id });
    await this.notifications.notifyAdmins('salon à valider', salon.name);
    return updated;
  }

  @ProSalon({ ownerOnly: true }) @upload() @Post('salon/logo')
  async logo(@CurrentSalon() salon: Salon, @UploadedFile() file: Upload) {
    const { url } = await this.storage.save(file, { folder: 'logos', isPublic: true });
    return this.prisma.salon.update({ where: { id: salon.id }, data: { logoUrl: url } });
  }

  @ProSalon({ ownerOnly: true }) @upload() @Post('salon/cover')
  async cover(@CurrentSalon() salon: Salon, @UploadedFile() file: Upload) {
    await this.entitlements.require(salon.id, 'customBranding');
    const { url } = await this.storage.save(file, { folder: 'covers', isPublic: true });
    return this.prisma.salon.update({ where: { id: salon.id }, data: { coverUrl: url } });
  }

  @ProSalon({ ownerOnly: true }) @upload() @Post('salon/photos')
  async addPhoto(@CurrentSalon() salon: Salon, @UploadedFile() file: Upload) {
    const [features, count] = await Promise.all([
      this.entitlements.features(salon.id), this.prisma.salonPhoto.count({ where: { salonId: salon.id } }),
    ]);
    if (count >= features.maxPhotos) throw forbidden('PLAN_LIMIT', `Votre abonnement autorise ${features.maxPhotos} photos`);
    const { url } = await this.storage.save(file, { folder: 'photos', isPublic: true });
    return this.prisma.salonPhoto.create({ data: { salonId: salon.id, url: url!, position: count } });
  }

  @ProSalon({ ownerOnly: true }) @Delete('salon/photos/:id')
  async removePhoto(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.salonPhoto.deleteMany({ where: { id, salonId: salon.id } });
    if (!count) throw notFound('Photo');
    return { ok: true };
  }

  // ─── Prestations ───

  @ProSalon() @Get('services')
  services(@CurrentSalon() salon: Salon) {
    return this.prisma.service.findMany({ where: { salonId: salon.id }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  }

  @ProSalon({ ownerOnly: true }) @Post('services')
  async createService(@CurrentSalon() salon: Salon, @Body() dto: ServiceDto) {
    const staff = await this.prisma.staffMember.findMany({ where: { salonId: salon.id }, select: { id: true } });
    // Par défaut, toute l'équipe peut réaliser une nouvelle prestation (ajustable par professionnel).
    return this.prisma.service.create({
      data: { ...dto, salonId: salon.id, staff: { create: staff.map((s) => ({ staffId: s.id })) } },
    });
  }

  @ProSalon({ ownerOnly: true }) @Patch('services/:id')
  async updateService(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    const { count } = await this.prisma.service.updateMany({ where: { id, salonId: salon.id }, data: dto });
    if (!count) throw notFound('Prestation');
    return this.prisma.service.findUnique({ where: { id } });
  }

  /** Une prestation déjà utilisée est désactivée plutôt que supprimée, pour conserver l'historique. */
  @ProSalon({ ownerOnly: true }) @Delete('services/:id')
  async removeService(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, salonId: salon.id }, include: { _count: { select: { appointments: true, tickets: true } } },
    });
    if (!service) throw notFound('Prestation');
    if (service._count.appointments || service._count.tickets) {
      await this.prisma.service.update({ where: { id }, data: { active: false } });
      return { ok: true, deactivated: true };
    }
    await this.prisma.service.delete({ where: { id } });
    return { ok: true, deactivated: false };
  }

  // ─── Équipe, horaires, absences ───

  @ProSalon() @Get('staff')
  staff(@CurrentSalon() salon: Salon) {
    return this.prisma.staffMember.findMany({
      where: { salonId: salon.id }, orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
      omit: { inviteTokenHash: true },
      include: {
        user: { select: { id: true, email: true } },
        services: { select: { serviceId: true } },
        workingHours: { orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] },
        timeOffs: { where: { endAt: { gt: new Date() } }, orderBy: { startAt: 'asc' } },
      },
    });
  }

  @ProSalon({ ownerOnly: true }) @Post('staff')
  async createStaff(@CurrentSalon() salon: Salon, @Body() dto: StaffDto) {
    const [features, count, owner] = await Promise.all([
      this.entitlements.features(salon.id),
      this.prisma.staffMember.count({ where: { salonId: salon.id, active: true } }),
      this.prisma.staffMember.findFirst({ where: { salonId: salon.id, isOwner: true }, include: { workingHours: true } }),
    ]);
    if (count >= features.maxStaff) throw forbidden('PLAN_LIMIT', `Votre abonnement autorise ${features.maxStaff} professionnel(s)`);
    const serviceIds = dto.serviceIds
      ?? (await this.prisma.service.findMany({ where: { salonId: salon.id }, select: { id: true } })).map((s) => s.id);
    await this.assertServices(salon.id, serviceIds);
    return this.prisma.staffMember.create({
      data: {
        salonId: salon.id, displayName: dto.displayName.trim(), title: dto.title, active: dto.active ?? true,
        services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        // Le nouveau membre reprend les horaires du propriétaire comme point de départ.
        workingHours: { create: (owner?.workingHours ?? []).map((w) => ({ salonId: salon.id, weekday: w.weekday, startMin: w.startMin, endMin: w.endMin })) },
      },
      include: { services: true, workingHours: true },
    });
  }

  @ProSalon({ ownerOnly: true }) @Patch('staff/:id')
  async updateStaff(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    const member = await this.prisma.staffMember.findFirst({ where: { id, salonId: salon.id } });
    if (!member) throw notFound('Professionnel');
    if (dto.active === false && member.isOwner) throw badRequest('OWNER_ACTIVE', 'Le propriétaire ne peut pas être désactivé');
    if (dto.active === true && !member.active) {
      const [features, count] = await Promise.all([
        this.entitlements.features(salon.id), this.prisma.staffMember.count({ where: { salonId: salon.id, active: true } }),
      ]);
      if (count >= features.maxStaff) throw forbidden('PLAN_LIMIT', `Votre abonnement autorise ${features.maxStaff} professionnel(s)`);
    }
    if (dto.serviceIds) await this.assertServices(salon.id, dto.serviceIds);
    const { serviceIds, ...data } = dto;
    return this.prisma.staffMember.update({
      where: { id },
      data: {
        ...data,
        ...(serviceIds ? { services: { deleteMany: {}, create: serviceIds.map((serviceId) => ({ serviceId })) } } : {}),
      },
      include: { services: { select: { serviceId: true } } },
    });
  }

  @ProSalon({ ownerOnly: true }) @upload() @Post('staff/:id/photo')
  async staffPhoto(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Upload) {
    await this.ownStaff(salon.id, id);
    const { url } = await this.storage.save(file, { folder: 'staff', isPublic: true });
    return this.prisma.staffMember.update({ where: { id }, data: { photoUrl: url } });
  }

  /** Remplace les horaires hebdomadaires d'un professionnel. Les trous entre deux plages sont des pauses. */
  @ProSalon() @Put('staff/:id/hours')
  async setHours(
    @CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Req() req: { isOwner: boolean },
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: HoursDto,
  ) {
    await this.ownStaff(salon.id, id, req.isOwner ? undefined : u.id);
    for (const h of dto.hours) if (h.endMin <= h.startMin) throw badRequest('BAD_HOURS', 'Une plage horaire doit se terminer après son début');
    for (const a of dto.hours) for (const b of dto.hours) {
      if (a !== b && a.weekday === b.weekday && a.startMin < b.endMin && b.startMin < a.endMin) {
        throw badRequest('BAD_HOURS', 'Deux plages horaires se chevauchent');
      }
    }
    await this.prisma.$transaction([
      this.prisma.workingHour.deleteMany({ where: { staffId: id } }),
      this.prisma.workingHour.createMany({ data: dto.hours.map((h) => ({ ...h, staffId: id, salonId: salon.id })) }),
    ]);
    return this.prisma.workingHour.findMany({ where: { staffId: id }, orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] });
  }

  @ProSalon() @Post('staff/:id/time-off')
  async addTimeOff(
    @CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Req() req: { isOwner: boolean },
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: TimeOffDto,
  ) {
    await this.ownStaff(salon.id, id, req.isOwner ? undefined : u.id);
    const startAt = new Date(dto.startAt), endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw badRequest('BAD_RANGE', 'La fin doit être après le début');
    const clash = await this.prisma.appointment.count({
      where: { staffId: id, status: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] }, startAt: { lt: endAt }, endAt: { gt: startAt } },
    });
    const timeOff = await this.prisma.timeOff.create({ data: { salonId: salon.id, staffId: id, startAt, endAt, reason: dto.reason } });
    // Les rendez-vous déjà pris ne sont pas annulés automatiquement : le professionnel est averti.
    return { ...timeOff, conflictingAppointments: clash };
  }

  @ProSalon() @Delete('time-off/:id')
  async removeTimeOff(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Req() req: { isOwner: boolean }, @Param('id', ParseUUIDPipe) id: string) {
    const timeOff = await this.prisma.timeOff.findFirst({ where: { id, salonId: salon.id } });
    if (!timeOff) throw notFound('Absence');
    await this.ownStaff(salon.id, timeOff.staffId, req.isOwner ? undefined : u.id);
    await this.prisma.timeOff.delete({ where: { id } });
    return { ok: true };
  }

  /** Vérifie que le professionnel appartient au salon et, pour un membre, qu'il s'agit de sa propre fiche. */
  private async ownStaff(salonId: string, staffId: string, mustBeUserId?: string) {
    const member = await this.prisma.staffMember.findFirst({ where: { id: staffId, salonId } });
    if (!member) throw notFound('Professionnel');
    if (mustBeUserId && member.userId !== mustBeUserId) throw forbidden('OWNER_ONLY', 'Vous ne pouvez modifier que vos propres disponibilités');
    return member;
  }

  private async assertServices(salonId: string, ids: string[]) {
    const found = await this.prisma.service.count({ where: { salonId, id: { in: ids } } });
    if (found !== new Set(ids).size) throw badRequest('BAD_SERVICE', 'Prestation inconnue pour ce salon');
  }
}
