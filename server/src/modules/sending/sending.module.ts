import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EMAIL_QUEUE, MAINTENANCE_QUEUE } from './sending.constants';

import { SendingController } from './sending.controller';
import { UnsubscribeController } from './unsubscribe.controller';

import { MailerService } from './mailer.service';
import { SendingServerService } from './sending-server.service';
import { SendingDomainService } from './sending-domain.service';
import { EmailJobService } from './email-job.service';
import { CampaignDispatchService } from './campaign-dispatch.service';
import { UnsubscribeService } from './unsubscribe.service';
import { EmailProcessor } from './email.processor';
import { MaintenanceProcessor } from './maintenance.processor';
import { BillingModule } from '../billing/billing.module';

/**
 * Sending Engine (Step 12).
 *
 * BullModule.forRoot lives in AppModule (one Redis connection for the app).
 * Here we just register this module's queues and its providers. PrismaModule is
 * @Global, so PrismaService is available without importing it.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: MAINTENANCE_QUEUE },
    ),
    BillingModule, // BillingUsageService.recordEmailSent() after a successful send
  ],
  controllers: [SendingController, UnsubscribeController],
  providers: [
    MailerService,
    SendingServerService,
    SendingDomainService,
    EmailJobService,
    CampaignDispatchService,
    UnsubscribeService,
    EmailProcessor,
    MaintenanceProcessor,
  ],
  exports: [SendingServerService, SendingDomainService],
})
export class SendingModule {}