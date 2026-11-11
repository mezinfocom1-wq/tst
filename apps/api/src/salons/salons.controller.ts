import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { PrismaService } from '../common/prisma.service';
import { AvailabilityDto } from './salons.dto';
import { SalonsService, SearchQuery } from './salons.service';

@ApiTags('marketplace')
@Controller('salons')
export class SalonsController {
  constructor(private salons: SalonsService, private prisma: PrismaService) {}

  @Public() @Get()
  search(@Query() query: SearchQuery) {
    return this.salons.search(query);
  }

  @Public() @Get('cities')
  cities() {
    return this.salons.cities();
  }

  @Public() @Get(':slug')
  detail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.salons.detail(slug, user);
  }

  @Public() @HttpCode(200) @Post(':id/availability')
  availability(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AvailabilityDto) {
    return this.salons.availability(id, dto);
  }

  @Public() @Get(':id/reviews')
  async reviews(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string) {
    const take = 20, skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where: { salonId: id, hidden: false }, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.review.count({ where: { salonId: id, hidden: false } }),
    ]);
    const authors = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, firstName: true } });
    return {
      total,
      items: rows.map((r) => ({
        id: r.id, rating: r.rating, comment: r.comment, reply: r.reply, createdAt: r.createdAt,
        author: authors.find((a) => a.id === r.clientId)?.firstName ?? 'Client',
      })),
    };
  }
}
