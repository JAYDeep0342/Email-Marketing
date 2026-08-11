import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ORPHAN_SENDING_MINUTES,
  RECONCILE_EVERY_MS,
  RECONCILE_JOB_ID,
  RECONCILE_JOB_NAME,
  RECONCILE_QUEUE,
} from './tracking.constants';

interface OrphanRow {
  id: string;
  tenant_id: string;
}

/**
 * Watchdog for campaigns wedged in 'sending'. Closes the gap Step 12's
 * verification flagged: if a worker crashes AFTER flipping scheduled->sending
 * but BEFORE/DURING job creation, the campaign could stay 'sending' forever
 * with no process owning it.
 *
 * Every RECONCILE_EVERY_MS we find campaigns that are 'sending', older than
 * ORPHAN_SENDING_MINUTES, with NO email_jobs still queued/sending, and finalize
 * them to 'sent'. Cross-tenant discovery reuses the SECURITY DEFINER pattern.
 *
 * Runs on its OWN queue (sending-reconcile) — a queue can host only one
 * WorkerHost, so it must not share the sending-maintenance poller queue.
 */
@Processor(RECONCILE_QUEUE)
export class ReconciliationProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(
    @InjectQueue(RECONCILE_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async onModuleInit() {
    const existing = await this.queue.getRepeatableJobs();
    for (const r of existing) {
      if (r.name === RECONCILE_JOB_NAME) {
        await this.queue.removeRepeatableByKey(r.key);
      }
    }
    await this.queue.add(
      RECONCILE_JOB_NAME,
      {},
      {
        repeat: { every: RECONCILE_EVERY_MS },
        jobId: RECONCILE_JOB_ID,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Sending reconciliation watchdog registered (every ${RECONCILE_EVERY_MS / 60000}m)`,
    );
  }

  async process(_job: Job): Promise<void> {
    await this.reconcile();
  }

  private async reconcile(): Promise<void> {
    const orphans = await this.prisma.$queryRaw<OrphanRow[]>`
      SELECT id, tenant_id FROM sending_orphaned_campaigns(${ORPHAN_SENDING_MINUTES})
    `;
    let fixed = 0;
    for (const o of orphans) {
      try {
        await this.prisma.withTenant(o.tenant_id, async (tx) => {
          const res = await tx.campaign.updateMany({
            where: { id: o.id, status: 'sending' },
            data: { status: 'sent', sentAt: new Date() },
          });
          if (res.count > 0) fixed += 1;
        });
      } catch (e) {
        this.logger.error(
          `reconcile failed for campaign ${o.id}: ${(e as Error).message}`,
        );
      }
    }
    if (fixed > 0) {
      this.logger.warn(`reconciled ${fixed} orphaned 'sending' campaign(s)`);
    }
  }
}