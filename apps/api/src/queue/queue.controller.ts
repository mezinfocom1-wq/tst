import { Body, Controller, Get, HttpCode, MessageEvent, Param, ParseUUIDPipe, Post, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Salon } from '@prisma/client';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Observable, interval, map, merge } from 'rxjs';
import { AuthUser, CurrentSalon, CurrentUser, ProSalon, Public } from '../common/auth';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { QueueService } from './queue.service';

class JoinDto {
  @IsUUID() serviceId: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsString() @MaxLength(100) qrToken?: string;
}
class WalkInDto {
  @IsString() @MinLength(1) @MaxLength(60) guestName: string;
  @IsUUID() serviceId: string;
  @IsOptional() @IsUUID() staffId?: string;
}
class CallDto {
  @IsUUID() staffId: string;
  @IsOptional() @IsUUID() ticketId?: string;
  @IsOptional() @IsBoolean() force?: boolean;
}

@ApiTags('queue')
@Controller()
export class QueueController {
  constructor(private queue: QueueService, private prisma: PrismaService) {}

  @Public() @Get('salons/:id/queue')
  status(@Param('id', ParseUUIDPipe) id: string, @Query('serviceId') serviceId?: string, @Query('staffId') staffId?: string) {
    return this.queue.publicStatus(id, serviceId || undefined, staffId || undefined);
  }

  /** Flux SSE : un événement à chaque changement de la file, plus un battement toutes les 25 secondes. */
  @Public() @SkipThrottle() @Sse('salons/:id/queue/stream')
  stream(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return merge(
      this.queue.stream(id).pipe(map((e) => ({ type: 'update', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent)),
    );
  }

  @ApiBearerAuth() @Post('salons/:id/queue/join')
  join(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JoinDto) {
    return this.queue.join(u, id, dto);
  }

  @ApiBearerAuth() @Get('queue/tickets')
  mine(@CurrentUser() u: AuthUser) {
    return this.queue.mine(u.id);
  }

  @ApiBearerAuth() @Get('queue/tickets/:id')
  one(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.queue.view(id, u.id);
  }

  @ApiBearerAuth() @HttpCode(200) @Post('queue/tickets/:id/cancel')
  async cancelMine(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ticket = await this.prisma.queueTicket.findFirst({ where: { id, clientId: u.id }, include: { salon: true } });
    if (!ticket) throw notFound('Ticket');
    return this.queue.cancel(ticket.salon, u.id, id, u.id);
  }

  // ─── Espace professionnel ───

  @ApiBearerAuth() @ProSalon() @Get('pro/queue')
  board(@CurrentSalon() salon: Salon) {
    return this.queue.board(salon.id);
  }

  /** Ajout manuel d'un client de passage (sans compte ni smartphone) pour garder la file exacte. */
  @ApiBearerAuth() @ProSalon() @Post('pro/queue')
  walkIn(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Body() dto: WalkInDto) {
    return this.queue.create(salon, { guestName: dto.guestName.trim(), serviceId: dto.serviceId, staffId: dto.staffId, actorId: u.id });
  }

  @ApiBearerAuth() @ProSalon() @HttpCode(200) @Post('pro/queue/call')
  call(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Body() dto: CallDto) {
    return this.queue.call(salon, u.id, dto.staffId, { ticketId: dto.ticketId, force: dto.force });
  }

  @ApiBearerAuth() @ProSalon() @HttpCode(200) @Post('pro/queue/:id/start')
  start(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.queue.start(salon, u.id, id);
  }

  @ApiBearerAuth() @ProSalon() @HttpCode(200) @Post('pro/queue/:id/finish')
  finish(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.queue.finish(salon, u.id, id);
  }

  @ApiBearerAuth() @ProSalon() @HttpCode(200) @Post('pro/queue/:id/no-show')
  noShow(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.queue.noShow(salon, u.id, id);
  }

  @ApiBearerAuth() @ProSalon() @HttpCode(200) @Post('pro/queue/:id/requeue')
  requeue(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.queue.requeue(salon, u.id, id);
  }

  @ApiBearerAuth() @ProSalon() @HttpCode(200) @Post('pro/queue/:id/cancel')
  cancel(@CurrentSalon() salon: Salon, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.queue.cancel(salon, u.id, id);
  }
}
