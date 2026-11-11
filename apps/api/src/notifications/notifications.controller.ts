import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../common/prisma.service';

class DeviceDto {
  @IsString() @MaxLength(300) token: string;
  @IsIn(['ios', 'android', 'web']) platform: string;
}

@ApiTags('notifications') @ApiBearerAuth()
@Controller('me')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get('notifications')
  async list(@CurrentUser() u: AuthUser, @Query('take') take?: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: u.id, status: { not: 'SKIPPED' } },
        orderBy: { createdAt: 'desc' }, take: Math.min(Number(take) || 50, 100),
      }),
      this.prisma.notification.count({ where: { userId: u.id, readAt: null, status: { not: 'SKIPPED' } } }),
    ]);
    return { items, unread };
  }

  @Post('notifications/read-all')
  async readAll(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('devices')
  async registerDevice(@CurrentUser() u: AuthUser, @Body() dto: DeviceDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { token: dto.token, platform: dto.platform, userId: u.id },
      update: { userId: u.id, platform: dto.platform },
    });
    return { ok: true };
  }

  @Post('devices/:token/remove')
  async removeDevice(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId: u.id } });
    return { ok: true };
  }
}
