import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitlementsService } from '../billing/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from './audit.service';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';

const providers = [PrismaService, AuditService, SettingsService, StorageService, NotificationsService, EntitlementsService];

/** Services transverses partagés par tous les modules métier. */
@Global()
@Module({
  imports: [JwtModule.register({ global: true, secret: config.jwtSecret, signOptions: { expiresIn: config.accessTtlSec } })],
  providers,
  exports: providers,
})
export class CoreModule {}
