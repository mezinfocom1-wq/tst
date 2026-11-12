import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { config } from '../common/config';
import { conflict, forbidden } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ChangePasswordDto, DeleteAccountDto, ForgotDto, GoogleDto, LoginDto, ProApplicationDto, RefreshDto, RegisterDto, ResetDto, TokenDto, UpdateMeDto,
} from './auth.dto';
import { AuthService, publicUser } from './auth.service';

const COOKIE = 'rt';
const relaxed = process.env.NODE_ENV === 'test';
const limit = (n: number) => ({ default: { limit: relaxed ? 100_000 : n, ttl: 60_000 } });
const strict = limit(10);

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Web : le jeton de rafraîchissement voyage dans un cookie httpOnly (inaccessible au JavaScript).
   * Mobile (en-tête `x-client: mobile`) : il est renvoyé dans la réponse et rangé dans le stockage sécurisé.
   */
  private respond(req: Request, res: Response, session: Awaited<ReturnType<AuthService['issueSession']>>) {
    const { refreshToken, ...rest } = session;
    if (req.headers['x-client'] === 'mobile') return session;
    res.cookie(COOKIE, refreshToken, {
      httpOnly: true, secure: config.cookieSecure, sameSite: 'lax',
      path: '/api/auth', maxAge: config.refreshDays * 86_400_000,
    });
    return rest;
  }

  @Public() @Throttle(strict) @Post('auth/register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto);
    return this.respond(req, res, await this.auth.issueSession(user, req.headers['user-agent']));
  }

  @Public() @Throttle(strict) @HttpCode(200) @Post('auth/login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(dto.email, dto.password, req.ip);
    return this.respond(req, res, await this.auth.issueSession(user, req.headers['user-agent']));
  }

  @Public() @Throttle(strict) @HttpCode(200) @Post('auth/google')
  async google(@Body() dto: GoogleDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.googleLogin(dto.idToken, dto.locale);
    return this.respond(req, res, await this.auth.issueSession(user, req.headers['user-agent']));
  }

  @Public() @HttpCode(200) @Post('auth/refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.refresh(dto.refreshToken ?? req.cookies?.[COOKIE], req.headers['user-agent']);
    return this.respond(req, res, session);
  }

  @Public() @HttpCode(200) @Post('auth/logout')
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken ?? req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/api/auth' });
    return { ok: true };
  }

  @Public() @Throttle(strict) @HttpCode(200) @Post('auth/verify-email')
  async verifyEmail(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @ApiBearerAuth() @Throttle(limit(3)) @HttpCode(200) @Post('auth/resend-verification')
  async resend(@CurrentUser() u: AuthUser) {
    await this.auth.sendVerification(await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } }));
    return { ok: true };
  }

  @Public() @Throttle(limit(5)) @HttpCode(200) @Post('auth/forgot-password')
  async forgot(@Body() dto: ForgotDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public() @Throttle(strict) @HttpCode(200) @Post('auth/reset-password')
  async reset(@Body() dto: ResetDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  @Public() @Get('auth/config')
  authConfig() {
    return { googleClientId: config.googleClientId || null };
  }

  @ApiBearerAuth() @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    return publicUser(await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } }));
  }

  @ApiBearerAuth() @Patch('me')
  async updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    return publicUser(await this.auth.updateMe(u.id, dto));
  }

  @ApiBearerAuth() @HttpCode(200) @Post('me/password')
  async changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(u.id, dto);
    return { ok: true };
  }

  @ApiBearerAuth() @Get('me/export')
  exportData(@CurrentUser() u: AuthUser) {
    return this.auth.exportData(u.id);
  }

  @ApiBearerAuth() @Throttle(strict) @HttpCode(200) @Post('me/delete')
  async deleteAccount(@CurrentUser() u: AuthUser, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.deleteAccount(u.id, dto.password);
    res.clearCookie(COOKIE, { path: '/api/auth' });
    return { ok: true };
  }

  // ─── Demande d'accès professionnel ───

  @ApiBearerAuth() @Get('pro-application')
  async myApplication(@CurrentUser() u: AuthUser) {
    return this.prisma.proApplication.findUnique({ where: { userId: u.id } });
  }

  /** Créer un compte ne donne aucun droit professionnel : la demande doit être validée par le Super Admin. */
  @ApiBearerAuth() @Post('pro-application')
  async apply(@CurrentUser() u: AuthUser, @Body() dto: ProApplicationDto) {
    if (u.role !== 'CLIENT') throw forbidden('FORBIDDEN', 'Ce compte ne peut pas déposer de demande');
    if (!u.emailVerified) throw forbidden('EMAIL_NOT_VERIFIED', 'Confirmez votre adresse email avant de déposer une demande');
    const existing = await this.prisma.proApplication.findUnique({ where: { userId: u.id } });
    if (existing && existing.status === 'PENDING') throw conflict('APPLICATION_PENDING', 'Une demande est déjà en cours');
    if (existing && existing.status === 'APPROVED') throw conflict('APPLICATION_APPROVED', 'Votre demande est déjà acceptée');
    const data = { ...dto, status: 'PENDING' as const, adminNote: null, reviewedAt: null, reviewedById: null };
    const app = await this.prisma.proApplication.upsert({ where: { userId: u.id }, create: { ...data, userId: u.id }, update: data });
    await this.notifications.notifyAdmins('demande professionnelle', dto.businessName);
    return app;
  }
}
