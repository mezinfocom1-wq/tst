import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ComplaintDto } from './admin.dto';

@ApiTags('complaints') @ApiBearerAuth()
@Controller()
export class ComplaintsController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  @Post('complaints')
  async create(@CurrentUser() u: AuthUser, @Body() dto: ComplaintDto) {
    const salon = dto.salonId ? await this.prisma.salon.findUnique({ where: { id: dto.salonId }, select: { id: true } }) : null;
    const complaint = await this.prisma.complaint.create({ data: { authorId: u.id, subject: dto.subject.trim(), message: dto.message.trim(), salonId: salon?.id } });
    await this.notifications.notifyAdmins('réclamation', dto.subject);
    return complaint;
  }

  @Get('me/complaints')
  mine(@CurrentUser() u: AuthUser) {
    return this.prisma.complaint.findMany({ where: { authorId: u.id }, orderBy: { createdAt: 'desc' } });
  }
}
