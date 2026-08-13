import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { EMAIL_JOB_CHUNK } from './sending.constants';

/**
 * Turns a campaign's frozen campaign_recipients snapshot into email_jobs.
 *
 * Idempotency is structural: idempotency_key = "campaign:<id>:contact:<id>"
 * and email_jobs has @@unique([tenantId, idempotencyKey]). Re-running dispatch
 * (crash, double-poll) can only createMany({ skipDuplicates: true }) — no row
 * is ever duplicated, so no contact can be mailed twice for one campaign.
 *
 * Runs inside the caller's tenant-scoped tx (no nested transaction).
 */
@Injectable()
export class EmailJobService {
  static idempotencyKey(campaignId: string, contactId: string): string {
    return `campaign:${campaignId}:contact:${contactId}`;
  }

  /**
   * Create queued email_jobs for every recipient of the campaign.
   * Returns the ids of jobs that are currently 'queued' (new + any left over
   * from a previous partial run), so the caller can enqueue them to BullMQ.
   */
  async buildForCampaign(
    tx: PrismaClient,
    campaign: { id: string; tenantId: string; sendingServerId: string | null },
  ): Promise<string[]> {
    const recipients = await tx.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
      select: { contactId: true },
    });

    for (let i = 0; i < recipients.length; i += EMAIL_JOB_CHUNK) {
      const slice = recipients.slice(i, i + EMAIL_JOB_CHUNK);
      await tx.emailJob.createMany({
        data: slice.map((r) => ({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          contactId: r.contactId,
          sendingServerId: campaign.sendingServerId,
          idempotencyKey: EmailJobService.idempotencyKey(
            campaign.id,
            r.contactId,
          ),
          status: 'queued',
        })),
        skipDuplicates: true,
      });
    }

    const queued = await tx.emailJob.findMany({
      where: { campaignId: campaign.id, status: 'queued' },
      select: { id: true },
    });
    return queued.map((j) => j.id);
  }
}