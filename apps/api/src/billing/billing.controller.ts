import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Salon } from '@prisma/client';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { AuthUser, CurrentSalon, CurrentUser, ProSalon, Public } from '../common/auth';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { StorageService } from '../common/storage.service';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';

class SubscribeDto {
  @IsUUID() planId: string;
}
class ProofDto {
  @IsString() @MinLength(3) @MaxLength(80) reference: string;
}

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
    private settings: SettingsService,
    private storage: StorageService,
    private entitlements: EntitlementsService,
  ) {}

  @Public() @Get('plans')
  plans() {
    return this.prisma.plan.findMany({ where: { active: true }, orderBy: { position: 'asc' } });
  }

  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @Get('pro/billing')
  async overview(@CurrentSalon() salon: Salon) {
    const [bank, plans, subscriptions, active] = await Promise.all([
      this.settings.get('bank'),
      this.prisma.plan.findMany({ where: { active: true }, orderBy: { position: 'asc' } }),
      this.prisma.subscription.findMany({
        where: { salonId: salon.id }, orderBy: { createdAt: 'desc' }, take: 50,
        include: { plan: true, payments: { orderBy: { createdAt: 'desc' }, omit: { proofKey: true } } },
      }),
      this.entitlements.activeSubscription(salon.id),
    ]);
    return { bank, plans, subscriptions, active };
  }

  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @Post('pro/billing/subscribe')
  subscribe(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Body() dto: SubscribeDto) {
    return this.billing.subscribe(salon.id, dto.planId, u.id);
  }

  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @HttpCode(200) @Post('pro/billing/payments/:id/proof')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async proof(
    @CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProofDto, @UploadedFile() file: { buffer: Buffer },
  ) {
    const payment = await this.prisma.payment.findFirst({ where: { id, salonId: salon.id } });
    if (!payment) throw notFound('Paiement');
    const { key } = await this.storage.save(file, { folder: 'proofs', isPublic: false, allowPdf: true, maxBytes: 8 * 1024 * 1024 });
    const updated = await this.billing.submitProof(salon.id, id, dto.reference.trim(), key, u.id);
    return { ...updated, proofKey: undefined };
  }

  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @Get('pro/billing/payments/:id/proof')
  async readProof(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const payment = await this.prisma.payment.findFirst({ where: { id, salonId: salon.id } });
    if (!payment?.proofKey) throw notFound('Preuve');
    const { buffer, mime } = await this.storage.read(payment.proofKey);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }).send(buffer);
  }

  /** Reçu d'un paiement validé (affiché et imprimé côté Web). */
  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @Get('pro/billing/payments/:id/receipt')
  async receipt(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, salonId: salon.id, status: 'VALIDATED' }, include: { subscription: { include: { plan: true } } }, omit: { proofKey: true },
    });
    if (!payment) throw notFound('Reçu');
    const general = await this.settings.get('general');
    return {
      receiptNumber: payment.receiptNumber, issuedAt: payment.reviewedAt, amountMad: payment.amountMad, reference: payment.reference,
      plan: payment.subscription.plan.name, periodStart: payment.subscription.startsAt, periodEnd: payment.subscription.endsAt,
      salon: { name: salon.name, address: salon.address, city: salon.city }, issuer: general.platformName,
    };
  }

  @ApiBearerAuth() @ProSalon({ ownerOnly: true }) @HttpCode(200) @Post('pro/billing/cancel')
  cancel(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser) {
    return this.billing.cancel(salon.id, u.id);
  }
}
