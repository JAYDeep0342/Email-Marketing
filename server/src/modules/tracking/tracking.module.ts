import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RECONCILE_QUEUE } from './tracking.constants';

import { WebhookController } from './webhook.controller';
import { TrackingController } from './tracking.controller';
import { AnalyticsController } from './analytics.controller';
import { DashboardController } from './dashboard.controller';

import { TrackingEventsService } from './tracking-events.service';
import { AnalyticsService } from './analytics.service';
import { DashboardAnalyticsService } from './dashboard.service';
import { SesProvider } from './providers/ses.provider';
import { SimulatorProvider } from './providers/simulator.provider';
import { ReconciliationProcessor } from './reconciliation.service';

/**
 * Step 13 — Tracking & Analytics.
 *
 * BullModule.forRoot lives in AppModule. Here we register the dedicated
 * reconciliation queue and wire providers/controllers. PrismaModule is @Global.
 *
 * TrackingEventsService is exported so the Sending Engine's processor can call
 * it (e.g. to record a 'sent' event on successful handoff, if desired later).
 */
@Module({
  imports: [BullModule.registerQueue({ name: RECONCILE_QUEUE })],
  controllers: [WebhookController, TrackingController, AnalyticsController, DashboardController],
  providers: [
    TrackingEventsService,
    AnalyticsService,
    DashboardAnalyticsService,
    SesProvider,
    SimulatorProvider,
    ReconciliationProcessor,
  ],
  exports: [TrackingEventsService],
})
export class TrackingModule {}