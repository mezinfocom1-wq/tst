import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Salon } from '@prisma/client';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { EntitlementsService } from '../billing/entitlements.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentSalon, CurrentUser, ProSalon, Public } from '../common/auth';
import { config } from '../common/config';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

class InviteDto {
  @IsEmail() @MaxLength(254) email: string;
}
class AcceptDto {
  @IsString() @MaxLength(200) token: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const INVITE_DAYS = 7;

/**
 * Comptes de connexion des membres d'équipe.
 * Le propriétaire invite un membre par email ; le membre accepte avec son propre compte.
 * Un membre gère le planning, la file et ses propres disponibilités. Il n'a accès ni aux réglages du salon,
 * ni aux prestations, ni à l'équipe, ni à l'abonnement, ni aux statistiques (réservés au propriétaire).
 */
@ApiTags('team')
@Controller()
export class TeamController {
  constructor(
    private prisma: PrismaService,
    private entitlements: EntitlementsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @HttpCode(200) @Post('pro/staff/:id/invite')
  async invite(@CurrentSalon() salon: Salon, @CurrentUser() owner: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteDto) {
    const member = await this.prisma.staffMember.findFirst({ where: { id, salonId: salon.id } });
    if (!member) throw notFound('Professionnel');
    if (member.isOwner || member.userId) throw conflict('ALREADY_LINKED', 'Ce professionnel a déjà un compte de connexion');
    if ((await this.entitlements.features(salon.id)).maxStaff < 2) {
      throw forbidden('PLAN_FEATURE', "Les comptes d'équipe ne sont pas inclus dans votre abonnement");
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && (await this.belongsToASalon(existing.id))) throw conflict('USER_HAS_SALON', 'Ce compte est déjà rattaché à un salon');
    if (existing?.role === 'SUPER_ADMIN') throw badRequest('BAD_EMAIL', 'Cette adresse ne peut pas être invitée');

    const token = randomBytes(32).toString('base64url');
    await this.prisma.staffMember.update({
      where: { id }, data: { inviteEmail: email, inviteTokenHash: sha256(token), inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
    });
    const ownerUser = await this.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const locale = existing?.locale === 'ar' ? 'ar' : 'fr';
    await this.notifications.emailTo(email, 'team_invite', {
      name: member.displayName, salon: salon.name, owner: `${ownerUser.firstName} ${ownerUser.lastName}`.trim(),
      link: `${config.webUrl}/${locale}/join-team?token=${token}`,
    }, locale);
    await this.audit.log({ actorId: owner.id, action: 'team.invited', entityType: 'StaffMember', entityId: id, salonId: salon.id, meta: { email } });
    return { ok: true, inviteEmail: email };
  }

  /** Retire l'accès d'un membre (ou annule une invitation en attente). Sa fiche et son historique sont conservés. */
  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @Delete('pro/staff/:id/access')
  async revoke(@CurrentSalon() salon: Salon, @CurrentUser() owner: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const member = await this.prisma.staffMember.findFirst({ where: { id, salonId: salon.id } });
    if (!member) throw notFound('Professionnel');
    if (member.isOwner) throw badRequest('OWNER_ACCESS', "L'accès du propriétaire ne peut pas être retiré");
    await this.prisma.staffMember.update({ where: { id }, data: { userId: null, inviteEmail: null, inviteTokenHash: null, inviteExpiresAt: null } });
    if (member.userId) await this.demoteIfOrphan(member.userId);
    await this.audit.log({ actorId: owner.id, action: 'team.access_revoked', entityType: 'StaffMember', entityId: id, salonId: salon.id });
    return { ok: true };
  }

  /** Aperçu d'une invitation, affiché avant acceptation. */
  @Public() @Get('team-invites/:token')
  async preview(@Param('token') token: string) {
    const member = await this.findInvite(token);
    return { salon: member.salon.name, displayName: member.displayName, email: member.inviteEmail };
  }

  @ApiBearerAuth() @HttpCode(200) @Post('team-invites/accept')
  async accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptDto) {
    const member = await this.findInvite(dto.token);
    // L'invitation est nominative : seul le titulaire de l'adresse invitée, vérifiée, peut l'accepter.
    if (user.email.toLowerCase() !== member.inviteEmail) throw forbidden('WRONG_ACCOUNT', 'Cette invitation est destinée à une autre adresse email');
    if (!user.emailVerified) throw forbidden('EMAIL_NOT_VERIFIED', "Confirmez votre adresse email avant d'accepter l'invitation");
    if (user.role === 'SUPER_ADMIN') throw forbidden('FORBIDDEN', 'Ce compte ne peut pas rejoindre un salon');
    if (await this.belongsToASalon(user.id)) throw conflict('USER_HAS_SALON', 'Ce compte est déjà rattaché à un salon');
    const { count } = await this.prisma.staffMember.updateMany({
      where: { id: member.id, userId: null, inviteTokenHash: sha256(dto.token) },
      data: { userId: user.id, inviteTokenHash: null, inviteExpiresAt: null },
    });
    if (!count) throw conflict('INVITE_USED', 'Cette invitation a déjà été utilisée');
    // Droits limités au salon qui invite, sous la responsabilité de son propriétaire.
    await this.prisma.user.update({ where: { id: user.id }, data: { role: 'PROFESSIONAL' } });
    await this.audit.log({ actorId: user.id, action: 'team.joined', entityType: 'StaffMember', entityId: member.id, salonId: member.salonId });
    return { ok: true, salon: member.salon.name };
  }

  private async findInvite(token: string) {
    const member = await this.prisma.staffMember.findUnique({ where: { inviteTokenHash: sha256(token) }, include: { salon: { select: { name: true } } } });
    if (!member || member.userId || !member.inviteExpiresAt || member.inviteExpiresAt < new Date()) {
      throw badRequest('INVALID_INVITE', 'Invitation invalide ou expirée');
    }
    return member;
  }

  private async belongsToASalon(userId: string) {
    const [owned, staff] = await Promise.all([
      this.prisma.salon.count({ where: { ownerId: userId } }), this.prisma.staffMember.count({ where: { userId } }),
    ]);
    return owned + staff > 0;
  }

  /** Un ancien membre sans salon ni demande professionnelle acceptée redevient un simple client. */
  private async demoteIfOrphan(userId: string) {
    if (await this.belongsToASalon(userId)) return;
    const approved = await this.prisma.proApplication.count({ where: { userId, status: 'APPROVED' } });
    if (!approved) await this.prisma.user.updateMany({ where: { id: userId, role: 'PROFESSIONAL' }, data: { role: 'CLIENT' } });
  }
}
