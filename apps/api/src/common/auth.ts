import {
  CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role, Salon as SalonModel } from '@prisma/client';
import { AppError, forbidden } from './errors';
import { PrismaService } from './prisma.service';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  emailVerified: boolean;
  locale: string;
}

export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
/** Route de l'espace professionnel : le salon est déduit du compte, jamais d'un paramètre. */
export const ProSalon = (opts: { ownerOnly?: boolean } = {}) => SetMetadata('proSalon', opts);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
export const CurrentSalon = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SalonModel => ctx.switchToHttp().getRequest().salon,
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>('public', targets);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
        const u = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (u && u.status === 'ACTIVE') {
          req.user = {
            id: u.id, role: u.role, email: u.email,
            emailVerified: !!u.emailVerifiedAt, locale: u.locale,
          } satisfies AuthUser;
        } else if (u && !isPublic) {
          throw forbidden('ACCOUNT_SUSPENDED', 'Ce compte est suspendu');
        }
      } catch (e) {
        if (e instanceof AppError) throw e;
        if (!isPublic) throw new AppError(401, 'INVALID_TOKEN', 'Session invalide ou expirée');
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Connexion requise');

    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (roles?.length && !roles.includes(req.user.role)) {
      throw forbidden('FORBIDDEN', 'Accès refusé');
    }

    const pro = this.reflector.getAllAndOverride<{ ownerOnly?: boolean }>('proSalon', targets);
    if (pro) {
      if (req.user.role !== 'PROFESSIONAL') throw forbidden('FORBIDDEN', 'Accès réservé aux professionnels');
      const salon = await this.prisma.salon.findFirst({
        where: {
          OR: [
            { ownerId: req.user.id },
            { staff: { some: { userId: req.user.id, active: true } } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!salon) throw new AppError(404, 'NO_SALON', "Aucun salon n'est rattaché à ce compte");
      const isOwner = salon.ownerId === req.user.id;
      if (pro.ownerOnly && !isOwner) throw forbidden('OWNER_ONLY', 'Action réservée au propriétaire du salon');
      req.salon = salon;
      req.isOwner = isOwner;
    }
    return true;
  }
}
