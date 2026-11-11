import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Salon } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EntitlementsService } from '../billing/entitlements.service';
import { AuthUser, CurrentSalon, CurrentUser, ProSalon } from '../common/auth';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { LoyaltyService } from './loyalty.service';

class ProgramDto {
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(0) @Max(1000) pointsPerVisit: number;
  @IsInt() @Min(0) @Max(100) pointsPer10Mad: number;
}

class RewardDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsInt() @Min(1) @Max(100000) pointsCost: number;
  @IsIn(['DISCOUNT_AMOUNT', 'DISCOUNT_PERCENT', 'FREE_SERVICE']) type: 'DISCOUNT_AMOUNT' | 'DISCOUNT_PERCENT' | 'FREE_SERVICE';
  @IsOptional() @IsInt() @Min(1) @Max(100000) value?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('loyalty') @ApiBearerAuth()
@Controller()
export class LoyaltyController {
  constructor(private prisma: PrismaService, private loyalty: LoyaltyService, private entitlements: EntitlementsService) {}

  @Get('me/loyalty')
  overview(@CurrentUser() u: AuthUser) {
    return this.loyalty.overview(u.id);
  }

  @HttpCode(200) @Post('loyalty/rewards/:id/redeem')
  redeem(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loyalty.redeem(u.id, id);
  }

  @ProSalon() @Get('pro/loyalty')
  async get(@CurrentSalon() salon: Salon) {
    const [program, rewards, redemptions, features] = await Promise.all([
      this.prisma.loyaltyProgram.upsert({ where: { salonId: salon.id }, create: { salonId: salon.id }, update: {} }),
      this.prisma.loyaltyReward.findMany({ where: { salonId: salon.id }, orderBy: { pointsCost: 'asc' } }),
      this.prisma.loyaltyRedemption.findMany({ where: { salonId: salon.id }, include: { reward: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.entitlements.features(salon.id),
    ]);
    const clients = await this.prisma.user.findMany({
      where: { id: { in: redemptions.map((r) => r.clientId) } }, select: { id: true, firstName: true, lastName: true },
    });
    return {
      available: features.loyalty, program, rewards,
      redemptions: redemptions.map((r) => ({ ...r, client: clients.find((c) => c.id === r.clientId) })),
    };
  }

  @ProSalon({ ownerOnly: true }) @Put('pro/loyalty')
  async setProgram(@CurrentSalon() salon: Salon, @Body() dto: ProgramDto) {
    await this.entitlements.require(salon.id, 'loyalty');
    return this.prisma.loyaltyProgram.upsert({ where: { salonId: salon.id }, create: { salonId: salon.id, ...dto }, update: dto });
  }

  @ProSalon({ ownerOnly: true }) @Post('pro/loyalty/rewards')
  async createReward(@CurrentSalon() salon: Salon, @Body() dto: RewardDto) {
    await this.entitlements.require(salon.id, 'loyalty');
    if (dto.type !== 'FREE_SERVICE' && !dto.value) throw badRequest('VALUE_REQUIRED', 'Indiquez la valeur de la réduction');
    if (dto.type === 'DISCOUNT_PERCENT' && dto.value! > 100) throw badRequest('BAD_VALUE', 'Un pourcentage ne peut pas dépasser 100');
    return this.prisma.loyaltyReward.create({ data: { ...dto, salonId: salon.id } });
  }

  @ProSalon({ ownerOnly: true }) @Patch('pro/loyalty/rewards/:id')
  async updateReward(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RewardDto) {
    const { count } = await this.prisma.loyaltyReward.updateMany({ where: { id, salonId: salon.id }, data: dto });
    if (!count) throw notFound('Récompense');
    return this.prisma.loyaltyReward.findUnique({ where: { id } });
  }

  @ProSalon({ ownerOnly: true }) @Delete('pro/loyalty/rewards/:id')
  async removeReward(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.loyaltyReward.updateMany({ where: { id, salonId: salon.id }, data: { active: false } });
    if (!count) throw notFound('Récompense');
    return { ok: true };
  }

  /** Le professionnel valide en salon le bon présenté par le client. */
  @ProSalon() @HttpCode(200) @Post('pro/loyalty/redemptions/:code/use')
  async useRedemption(@CurrentSalon() salon: Salon, @Param('code') code: string) {
    const { count } = await this.prisma.loyaltyRedemption.updateMany({
      where: { code: code.toUpperCase(), salonId: salon.id, status: 'PENDING' }, data: { status: 'USED', usedAt: new Date() },
    });
    if (!count) throw notFound('Bon');
    return { ok: true };
  }
}
