import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailJobService } from './email-job.service';
import { SendingServerService } from './sending-server.service';
import {
  EMAIL_QUEUE,
  EMAIL_JOB_ATTEMPTS,
  EMAIL_JOB_BACKOFF_MS,
  JOB_SEND_EMAIL,
  MAX_CAMPAIGNS_PER_TICK,
  SendEmailJobData,
} from './sending.constants';

interface DueRow {
  campaign_id: string;
  tenant_id: string;
}

/**
 * The heart of Option B.
 *
 * A repeatable BullMQ poll (see MaintenanceProcessor) calls pollAndDispatch()
 * every POLL_EVERY_MS. That method:
 *   1. asks the DB for due campaigns via the sending_due_campaigns() SECURITY
 *      DEFINER function — the ONLY way to see across tenants under forced RLS
 *      without holding a tenant context (mirrors the auth_* lookup functions);
 *   2. for each, atomically CLAIMS it (scheduled -> sending via updateMany with
 *      a status guard, so only one instance/tick can win);
 *   3. builds email_jobs from the frozen recipient snapshot;
 *   4. after the tx commits, enqueues one BullMQ send job per email_job, using
 *      jobId = emailJobId so a re-dispatch cannot double-enqueue.
 */
@Injectable()
export class CampaignDispatchService {
  private readonly logger = new Logger(CampaignDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailJobs: EmailJobService,
    private readonly servers: SendingServerService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  async pollAndDispatch(): Promise<{ claimed: number; enqueued: number }> {
    const due = await this.prisma.$queryRaw<DueRow[]>`
      SELECT campaign_id, tenant_id FROM sending_due_campaigns()
      LIMIT ${MAX_CAMPAIGNS_PER_TICK}
    `;

    let claimed = 0;
    let enqueued = 0;

    // Pick the sending server once per tick (global resource).
    const server = await this.servers.pickActive();
    const sendingServerId = server?.id ?? null;

    for (const row of due) {
      try {
        const jobIds = await this.dispatchOne(
          row.campaign_id,
          row.tenant_id,
          sendingServerId,
        );
        if (jobIds === null) continue; // not claimed (already taken / not scheduled)
        claimed += 1;
        enqueued += await this.enqueue(jobIds, row.tenant_id);
      } catch (err) {
        // Never let one bad campaign kill the whole tick.
        this.logger.error(
          `dispatch failed for campaign ${row.campaign_id}: ${(err as Error).message}`,
        );
      }
    }

    if (claimed > 0) {
      this.logger.log(
        `poll: ${claimed} campaign(s) claimed, ${enqueued} email job(s) enqueued`,
      );
    }
    return { claimed, enqueued };
  }

  /**
   * Claim + build for a single campaign, entirely inside its tenant tx.
   * Returns the queued email_job ids, or null if the claim did not succeed.
   */
  private async dispatchOne(
    campaignId: string,
    tenantId: string,
    sendingServerId: string | null,
  ): Promise<string[] | null> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Atomic claim: only a row still 'scheduled' whose time has come flips.
      const claim = await tx.campaign.updateMany({
        where: {
          id: campaignId,
          status: 'scheduled',
          deletedAt: null,
          scheduledAt: { lte: new Date() },
        },
        data: { status: 'sending' },
      });
      if (claim.count === 0) return null; // someone else got it, or state changed

      const jobIds = await this.emailJobs.buildForCampaign(tx, {
        id: campaignId,
        tenantId,
        sendingServerId,
      });

      // Edge case: a campaign with zero recipients would otherwise get stuck in
      // 'sending' forever. Finalize it immediately.
      if (jobIds.length === 0) {
        await tx.campaign.updateMany({
          where: { id: campaignId, status: 'sending' },
          data: { status: 'sent', sentAt: new Date() },
        });
      }
      return jobIds;
    });
  }

  private async enqueue(jobIds: string[], tenantId: string): Promise<number> {
    let n = 0;
    for (const emailJobId of jobIds) {
      const data: SendEmailJobData = { emailJobId, tenantId };
      await this.emailQueue.add(JOB_SEND_EMAIL, data, {
        jobId: emailJobId, // dedup: same email job can never enqueue twice
        attempts: EMAIL_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: EMAIL_JOB_BACKOFF_MS },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      n += 1;
    }
    return n;
  }
}