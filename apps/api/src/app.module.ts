import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { ComplaintsController } from './admin/complaints.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { BookingController } from './booking/booking.controller';
import { BookingService } from './booking/booking.service';
import { AuthGuard } from './common/auth';
import { CoreModule } from './common/core.module';
import { HealthController } from './health.controller';
import { JobsService } from './jobs.service';
import { LoyaltyController } from './loyalty/loyalty.controller';
import { LoyaltyService } from './loyalty/loyalty.service';
import { NotificationsController } from './notifications/notifications.controller';
import { DurationEstimator, HistoricalDurationEstimator } from './queue/estimator';
import { QueueController } from './queue/queue.controller';
import { QueueService } from './queue/queue.service';
import { ReviewsController } from './reviews/reviews.controller';
import { ProInsightsController } from './salons/pro-insights.controller';
import { ProSalonController } from './salons/pro-salon.controller';
import { SalonsController } from './salons/salons.controller';
import { SalonsService } from './salons/salons.service';
import { SchedulingService } from './scheduling/scheduling.service';

@Module({
  imports: [
    CoreModule,
    ScheduleModule.forRoot(),
    // Limite générale par adresse IP ; les routes d'authentification ont une limite plus stricte.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 100_000 : 300 }]),
  ],
  controllers: [
    HealthController, AuthController, NotificationsController, SalonsController, ProSalonController, ProInsightsController,
    BookingController, QueueController, LoyaltyController, ReviewsController, BillingController, AdminController, ComplaintsController,
  ],
  providers: [
    AuthService, SalonsService, SchedulingService, BookingService, QueueService, LoyaltyService, BillingService, JobsService,
    // L'estimation de durée est injectée par son interface : un modèle prédictif pourra la remplacer ici.
    { provide: DurationEstimator, useClass: HistoricalDurationEstimator },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
