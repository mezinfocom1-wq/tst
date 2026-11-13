import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { AppError, badRequest, conflict } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChangePasswordDto, RegisterDto, UpdateMeDto } from './auth.dto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const publicUser = (u: User) => ({
  id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone,
  role: u.role, locale: u.locale, emailVerified: !!u.emailVerifiedAt,
  notifPrefs: u.notifPrefs, hasPassword: !!u.passwordHash,
});

@Injectable()
export class AuthService {
  private google = new OAuth2Client();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse email');
    }
    const user = await this.prisma.user.create({
      data: {
        email, passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
        firstName: dto.firstName.trim(), lastName: dto.lastName.trim(),
        phone: dto.phone, locale: dto.locale ?? 'fr',
        // En mode démonstration, aucun email ne peut être envoyé : l'adresse est considérée comme vérifiée.
        emailVerifiedAt: config.demoMode ? new Date() : null,
      },
    });
    await this.sendVerification(user);
    return user;
  }

  async login(emailRaw: string, password: string, ip?: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = new AppError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect');
    if (!user || !user.passwordHash) {
      await argon2.hash(password); // temps de réponse constant : ne révèle pas si le compte existe
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, 'ACCOUNT_LOCKED', `Trop de tentatives. Réessayez dans ${LOCK_MINUTES} minutes`);
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      const locked = failed >= MAX_FAILED;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: locked ? 0 : failed, lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      if (locked) await this.audit.log({ actorId: user.id, action: 'auth.locked', ip });
      throw invalid;
    }
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu');
    if (user.failedLogins || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    return user;
  }

  async googleLogin(idToken: string, locale?: string) {
    if (!config.googleClientId) throw badRequest('GOOGLE_DISABLED', "La connexion Google n'est pas configurée");
    let payload;
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience: config.googleClientId });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Jeton Google invalide');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Compte Google non vérifié');
    }
    const email = payload.email.toLowerCase();
    let user = await this.prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email, googleId: payload.sub, emailVerifiedAt: new Date(), locale: locale ?? 'fr',
          firstName: payload.given_name ?? email.split('@')[0], lastName: payload.family_name ?? '',
        },
      });
    } else if (!user.googleId || !user.emailVerifiedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id }, data: { googleId: payload.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    }
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu');
    return user;
  }

  /** Crée une session : jeton d'accès court + jeton de rafraîchissement (stocké haché). */
  async issueSession(user: User, userAgent?: string) {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id, tokenHash: sha256(refreshToken), userAgent: userAgent?.slice(0, 200),
        expiresAt: new Date(Date.now() + config.refreshDays * 86_400_000),
      },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, refreshToken, expiresIn: config.accessTtlSec, user: publicUser(user) };
  }

  /** Rotation : chaque jeton ne sert qu'une fois. Un jeton rejoué révoque toutes les sessions. */
  async refresh(token: string | undefined, userAgent?: string) {
    const invalid = new AppError(401, 'INVALID_REFRESH', 'Session expirée');
    if (!token) throw invalid;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row) throw invalid;
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actorId: row.userId, action: 'auth.refresh_reuse' });
      throw invalid;
    }
    if (row.expiresAt < new Date() || row.user.status !== 'ACTIVE') throw invalid;
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issueSession(row.user, userAgent);
  }

  async logout(token?: string) {
    if (token) {
      await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
    }
  }

  private async createEmailToken(userId: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD', ttlMin: number) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.emailToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMin * 60_000) },
    });
    return token;
  }

  async sendVerification(user: User) {
    if (user.emailVerifiedAt) return;
    const token = await this.createEmailToken(user.id, 'VERIFY_EMAIL', 24 * 60);
    await this.notifications.notify(user.id, 'verify_email', {
      firstName: user.firstName, link: `${config.webUrl}/${user.locale}/verify-email?token=${token}`,
    });
  }

  private async consumeEmailToken(token: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) {
      throw badRequest('INVALID_TOKEN', 'Lien invalide ou expiré');
    }
    await this.prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return row.userId;
  }

  async verifyEmail(token: string) {
    const userId = await this.consumeEmailToken(token, 'VERIFY_EMAIL');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  /** Répond toujours de la même façon, que le compte existe ou non. */
  async forgotPassword(emailRaw: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    if (!user || user.status !== 'ACTIVE') return;
    const token = await this.createEmailToken(user.id, 'RESET_PASSWORD', 60);
    await this.notifications.notify(user.id, 'reset_password', {
      firstName: user.firstName, link: `${config.webUrl}/${user.locale}/reset-password?token=${token}`,
    });
  }

  async resetPassword(token: string, password: string) {
    const userId = await this.consumeEmailToken(token, 'RESET_PASSWORD');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }), failedLogins: 0, lockedUntil: null, emailVerifiedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: userId, action: 'auth.password_reset' });
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName?.trim(), lastName: dto.lastName?.trim(), phone: dto.phone, locale: dto.locale,
        notifPrefs: dto.notifPrefs ? { ...(current.notifPrefs as object), ...dto.notifPrefs } : undefined,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.passwordHash && !(dto.currentPassword && (await argon2.verify(user.passwordHash, dto.currentPassword)))) {
      throw badRequest('WRONG_PASSWORD', 'Mot de passe actuel incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId }, data: { passwordHash: await argon2.hash(dto.newPassword, { type: argon2.argon2id }) },
    });
    await this.audit.log({ actorId: userId, action: 'auth.password_changed' });
  }

  /** Export des données personnelles (droit d'accès, loi 09-08). */
  async exportData(userId: string) {
    const [user, appointments, tickets, loyalty, reviews, complaints, application] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.appointment.findMany({
        where: { clientId: userId }, orderBy: { startAt: 'desc' },
        select: { startAt: true, endAt: true, status: true, priceMad: true, personName: true, salon: { select: { name: true } }, service: { select: { name: true } } },
      }),
      this.prisma.queueTicket.findMany({
        where: { clientId: userId }, orderBy: { joinedAt: 'desc' },
        select: { day: true, number: true, status: true, joinedAt: true, priceMad: true, salon: { select: { name: true } }, service: { select: { name: true } } },
      }),
      this.prisma.loyaltyTransaction.findMany({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: { salonId: true, points: true, reason: true, createdAt: true } }),
      this.prisma.review.findMany({ where: { clientId: userId }, select: { rating: true, comment: true, createdAt: true, salon: { select: { name: true } } } }),
      this.prisma.complaint.findMany({ where: { authorId: userId }, select: { subject: true, message: true, status: true, adminReply: true, createdAt: true } }),
      this.prisma.proApplication.findUnique({ where: { userId }, select: { businessName: true, city: true, phone: true, profession: true, status: true, createdAt: true } }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      account: { ...publicUser(user), createdAt: user.createdAt },
      appointments, queueTickets: tickets, loyaltyTransactions: loyalty, reviews, complaints, proApplication: application,
    };
  }

  /**
   * Suppression du compte à la demande de l'utilisateur.
   * Les données d'identité sont effacées ; l'historique comptable des salons (prestations réalisées) est conservé sous forme anonyme.
   */
  async deleteAccount(userId: string, password?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === 'SUPER_ADMIN') throw badRequest('ADMIN_ACCOUNT', 'Un compte administrateur ne peut pas être supprimé ici');
    if (user.passwordHash && !(password && (await argon2.verify(user.passwordHash, password)))) {
      throw badRequest('WRONG_PASSWORD', 'Mot de passe incorrect');
    }
    if (await this.prisma.salon.count({ where: { ownerId: userId } })) {
      throw conflict('OWNER_HAS_SALON', 'Votre compte est propriétaire d’un salon : contactez le support pour le clôturer');
    }
    const now = new Date();
    const future = await this.prisma.appointment.findMany({
      where: { clientId: userId, status: { in: ['CONFIRMED', 'CHECKED_IN'] }, startAt: { gt: now } }, select: { id: true, salonId: true, status: true },
    });
    await this.prisma.$transaction([
      this.prisma.appointment.updateMany({ where: { id: { in: future.map((a) => a.id) } }, data: { status: 'CANCELLED' } }),
      this.prisma.statusEvent.createMany({
        data: future.map((a) => ({ salonId: a.salonId, entityType: 'APPOINTMENT', entityId: a.id, fromStatus: a.status, toStatus: 'CANCELLED', actorId: userId, note: 'Compte supprimé' })),
      }),
      this.prisma.queueTicket.updateMany({ where: { clientId: userId, status: { in: ['WAITING', 'CALLED'] } }, data: { status: 'CANCELLED' } }),
      this.prisma.staffMember.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.emailToken.deleteMany({ where: { userId } }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.proApplication.deleteMany({ where: { userId } }),
      this.prisma.complaint.deleteMany({ where: { authorId: userId } }),
      this.prisma.review.updateMany({ where: { clientId: userId }, data: { comment: null } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `supprime-${userId}@invalid.local`, passwordHash: null, googleId: null, firstName: 'Compte', lastName: 'supprimé',
          phone: null, status: 'SUSPENDED', role: 'CLIENT', emailVerifiedAt: null, notifPrefs: {},
        },
      }),
    ]);
    await this.audit.log({ actorId: userId, action: 'user.deleted' });
  }
}
