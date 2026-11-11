import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, Salon } from '@prisma/client';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentSalon, CurrentUser, ProSalon } from '../common/auth';
import { badRequest, conflict, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

class ReviewDto {
  @IsOptional() @IsUUID() appointmentId?: string;
  @IsOptional() @IsUUID() ticketId?: string;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(1000) reply: string;
}

/** Recalcule la note moyenne affichée dans la marketplace. */
export async function refreshRating(prisma: PrismaService, salonId: string) {
  const agg = await prisma.review.aggregate({ where: { salonId, hidden: false }, _avg: { rating: true }, _count: true });
  await prisma.salon.update({
    where: { id: salonId }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count },
  });
}

@ApiTags('reviews') @ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private prisma: PrismaService) {}

  /** Un avis n'est possible qu'après une prestation réellement terminée, une seule fois par prestation. */
  @Post('reviews')
  async create(@CurrentUser() u: AuthUser, @Body() dto: ReviewDto) {
    if (!!dto.appointmentId === !!dto.ticketId) throw badRequest('BAD_TARGET', 'Indiquez un rendez-vous ou un ticket');
    const done = dto.appointmentId
      ? await this.prisma.appointment.findFirst({ where: { id: dto.appointmentId, clientId: u.id, status: 'COMPLETED' } })
      : await this.prisma.queueTicket.findFirst({ where: { id: dto.ticketId, clientId: u.id, status: 'DONE' } });
    if (!done) throw notFound('Prestation terminée');
    try {
      const review = await this.prisma.review.create({
        data: { salonId: done.salonId, clientId: u.id, appointmentId: dto.appointmentId, ticketId: dto.ticketId, rating: dto.rating, comment: dto.comment?.trim() || null },
      });
      await refreshRating(this.prisma, done.salonId);
      return review;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('ALREADY_REVIEWED', 'Vous avez déjà donné votre avis sur cette prestation');
      throw e;
    }
  }

  @ProSalon() @Get('pro/reviews')
  async list(@CurrentSalon() salon: Salon) {
    const rows = await this.prisma.review.findMany({ where: { salonId: salon.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    const authors = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, firstName: true, lastName: true } });
    return rows.map((r) => {
      const a = authors.find((x) => x.id === r.clientId);
      return { ...r, author: a ? `${a.firstName} ${a.lastName}`.trim() : 'Client' };
    });
  }

  @ProSalon({ ownerOnly: true }) @HttpCode(200) @Post('pro/reviews/:id/reply')
  async reply(@CurrentSalon() salon: Salon, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyDto) {
    const { count } = await this.prisma.review.updateMany({ where: { id, salonId: salon.id }, data: { reply: dto.reply.trim(), repliedAt: new Date() } });
    if (!count) throw notFound('Avis');
    return this.prisma.review.findUnique({ where: { id } });
  }
}
