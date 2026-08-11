import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AUTOMATION_QUEUE } from './automations.constants';
import { EMAIL_QUEUE } from '../sending/sending.constants';
import { SendingModule } from '../sending/sending.module';

import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import { EnrollmentService } from './enrollment.service';
import { AutomationTriggerListener } from './automation-trigger.listener';
import { StepExecutorService } from './steps/step-executor.service';
import { AutomationRunnerService } from './automation-runner.service';

/**
 * Step 15 — Automations (workflow engine).
 *
 * - Registers its own `automation` queue (repeatable run poller) and also needs
 *   the shared `email` queue to enqueue send_email steps.
 * - Imports SendingModule to reuse SendingServerService (pickActive) — the
 *   send_email step reuses the whole Sending Engine via email_jobs.automationRunId.
 * - EventEmitterModule is global (forRoot in AppModule); the trigger listener
 *   subscribes to AUTOMATION_TRIGGER_EVENT emitted by other modules.
 */
@Module({
  imports: [
    SendingModule,
    BullModule.registerQueue(
      { name: AUTOMATION_QUEUE },
      { name: EMAIL_QUEUE }, // re-declare so InjectQueue('email') resolves here
    ),
  ],
  controllers: [AutomationsController],
  providers: [
    AutomationsService,
    EnrollmentService,
    AutomationTriggerListener,
    StepExecutorService,
    AutomationRunnerService,
  ],
  exports: [EnrollmentService],
})
export class AutomationsModule {}