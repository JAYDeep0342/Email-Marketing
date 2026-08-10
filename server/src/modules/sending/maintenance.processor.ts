import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { CampaignDispatchService } from './campaign-dispatch.service';
import {
  MAINTENANCE_QUEUE,
  JOB_POLL_SCHEDULED,
  POLL_EVERY_MS,
  POLL_JOB_ID,
} from './sending.constants';

/**
 * The scheduler, implemented as a BullMQ REPEATABLE job instead of @nestjs/schedule.
 * Why: no extra dependency, and it is cluster-safe — a single repeatable job
 * fires once per interval across all app instances (no double-poll), and it
 * survives restarts (Redis holds the schedule).
 *
 * On boot we (re)register the repeatable job with a stable jobId so it is never
 * duplicated. Each tick calls CampaignDispatchService.pollAndDispatch().
 */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly dispatch: CampaignDispatchService,
  ) {
    super();
  }

  async onModuleInit() {
    // Clear any stale repeatable definitions, then (re)add ours. Idempotent.
    const existing = await this.queue.getRepeatableJobs();
    for (const r of existing) {
      if (r.name === JOB_POLL_SCHEDULED) {
        await this.queue.removeRepeatableByKey(r.key);
      }
    }
    await this.queue.add(
      JOB_POLL_SCHEDULED,
      {},
      {
        repeat: { every: POLL_EVERY_MS },
        jobId: POLL_JOB_ID,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Scheduled-campaign poller registered (every ${POLL_EVERY_MS / 1000}s)`,
    );
  }

  async process(_job: Job): Promise<void> {
    await this.dispatch.pollAndDispatch();
  }
}