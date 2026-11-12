import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Salon } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { AuthUser, CurrentSalon, CurrentUser, ProSalon } from '../common/auth';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { dayBounds, isValidDay, localDay } from '../common/tz';
import { BookingService } from './booking.service';

class ItemDto {
  @IsUUID() serviceId: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsString() @MaxLength(60) personName?: string;
}

class CreateBookingDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => ItemDto) items: ItemDto[];
  @IsISO8601() startAt: string;
  @IsOptional() @IsIn(['CONSECUTIVE', 'PARALLEL']) mode?: 'CONSECUTIVE' | 'PARALLEL';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(80) idempotencyKey?: string;
}

class ProBookingDto extends CreateBookingDto {
  @IsString() @MinLength(1) @MaxLength(60) guestName: string;
  @IsOptional() @Matches(/^(\+212|0)[5-7]\d{8}$/, { message: 'Numéro de téléphone marocain invalide' }) guestPhone?: string;
}

class RescheduleDto {
  @IsISO8601() startAt: string;
}
class ProRescheduleDto extends RescheduleDto {
  @IsOptional() @IsUUID() staffId?: string;
}

class StatusDto {
  @IsIn(['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) status: 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
}

@ApiTags('bookings') @ApiBearerAuth()
@Controller()
export class BookingController {
  constructor(private bookings: BookingService, private prisma: PrismaService) {}

  @Post('salons/:id/bookings')
  create(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateBookingDto) {
    return this.bookings.createForClient(u, id, dto);
  }

  @Get('me/appointments')
  mine(@CurrentUser() u: AuthUser) {
    return this.bookings.mine(u.id);
  }

  @HttpCode(200) @Post('appointments/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.cancelByClient(u.id, id);
  }

  @HttpCode(200) @Post('appointments/:id/reschedule')
  async reschedule(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleDto) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, clientId: u.id }, include: { salon: true } });
    if (!appt) throw notFound('Rendez-vous');
    return this.bookings.reschedule(appt.salon, id, dto.startAt, { actorId: u.id, clientId: u.id });
  }

  // ─── Espace professionnel ───

  /** Planning du salon : par défaut la journée en cours, ou une plage `from`/`to` (AAAA-MM-JJ). */
  @ProSalon() @Get('pro/appointments')
  list(@CurrentSalon() salon: Salon, @Query('from') from?: string, @Query('to') to?: string) {
    const first = from ?? localDay(), last = to ?? first;
    if (!isValidDay(first) || !isValidDay(last) || last < first) throw badRequest('BAD_DATE', 'Dates invalides');
    return this.bookings.listForSalon(salon.id, new Date(dayBounds(first)[0]), new Date(dayBounds(last)[1]));
  }

  /** Rendez-vous saisi par le professionnel pour un client au téléphone ou de passage. */
  @ProSalon() @Post('pro/appointments')
  createByPro(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Body() dto: ProBookingDto) {
    if (new Date(dto.startAt).getTime() < Date.now() - 5 * 60_000) throw badRequest('IN_THE_PAST', 'Ce créneau est déjà passé');
    return this.bookings.create(salon, dto, null, u.id);
  }

  @ProSalon() @HttpCode(200) @Post('pro/appointments/:id/status')
  status(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    return this.bookings.updateStatusByPro(salon, u.id, id, dto.status);
  }

  @ProSalon() @HttpCode(200) @Post('pro/appointments/:id/reschedule')
  rescheduleByPro(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProRescheduleDto) {
    return this.bookings.reschedule(salon, id, dto.startAt, { actorId: u.id, staffId: dto.staffId });
  }

  @ProSalon() @HttpCode(200) @Post('pro/appointments/:id/to-queue')
  toQueue(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.moveToQueue(salon, u.id, id);
  }

  @ProSalon() @Get('pro/appointments/:id/history')
  history(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.statusEvent.findMany({ where: { salonId: salon.id, entityType: 'APPOINTMENT', entityId: id }, orderBy: { createdAt: 'asc' } });
  }
}
