import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NormalizedEvent } from './tracking.constants';

interface JobRef {
  id: string;
  tenant_id: string;
  campaign_id: string | null;
  contact_id: string;
  status: string;
}

/**
 * The provider-agnostic core. Takes a NormalizedEvent, resolves which email_job
 * it belongs to (across RLS, via a SECURITY DEFINER lookup — webhooks have no
 * tenant context), then applies all effects INSIDE withTenant(tenant_id):
 *   - write the row to `events` (partitioned; events has NO RLS by design, so
 *     we always pass tenant_id explicitly and, on reads elsewhere, filter by it)
 *   - move email_jobs.status where appropriate (idempotent via status guards)
 *   - bump the matching campaign_stats counter (only when the guard actually
 *     transitioned, so duplicate webhooks don't double-count)
 *   - auto-suppress on hard bounce / complaint (protects sender reputation)
 */
@Injectable()
export class TrackingEventsService {
  private readonly logger = new Logger(TrackingEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Entry point used by webhook + open/click controllers. */
  async apply(ev: NormalizedEvent): Promise<void> {
    const job = await this.resolveJob(ev);
    if (!job) {
      this.logger.warn(
        `event ${ev.type} could not be matched to an email_job (msgId=${ev.providerMessageId ?? '-'}, jobId=${ev.emailJobId ?? '-'})`,
      );
      return;
    }

    await this.prisma.withTenant(job.tenant_id, async (tx) => {
      // 1. record the raw event (idempotency handled per-type below for stats)
      await tx.event.create({
        data: {
          tenantId: job.tenant_id,
          campaignId: job.campaign_id ?? undefined,
          contactId: job.contact_id,
          emailJobId: job.id,
          type: ev.type,
          url: ev.url,
          userAgent: ev.userAgent,
          ipAddress: ev.ipAddress ?? undefined,
          meta: (ev.meta ?? {}) as any,
          occurredAt: ev.occurredAt ?? new Date(),
        },
      });

      // 2. type-specific effects
      switch (ev.type) {
        case 'delivered':
          await this.onDelivered(tx, job);
          break;
        case 'bounce':
          await this.onBounce(tx, job, ev);
          break;
        case 'complaint':
          await this.onComplaint(tx, job);
          break;
        case 'open':
          await this.onOpen(tx, job);
          break;
        case 'click':
          await this.onClick(tx, job);
          break;
        // 'sent' / 'unsubscribe' handled elsewhere (send path / unsubscribe flow)
        default:
          break;
      }
    });
  }

  // ---- resolve which job an event belongs to ----

  private async resolveJob(ev: NormalizedEvent): Promise<JobRef | null> {
    if (ev.emailJobId) {
      const rows = await this.prisma.$queryRaw<JobRef[]>`
        SELECT id, tenant_id, campaign_id, contact_id, status
        FROM email_job_lookup_by_id(${ev.emailJobId}::uuid)
      `;
      return rows[0] ?? null;
    }
    if (ev.providerMessageId) {
      const rows = await this.prisma.$queryRaw<JobRef[]>`
        SELECT id, tenant_id, campaign_id, contact_id, status
        FROM email_job_lookup_by_provider(${ev.providerMessageId})
      `;
      return rows[0] ?? null;
    }
    return null;
  }

  // ---- per-type handlers (all idempotent) ----

  private async onDelivered(tx: PrismaClient, job: JobRef) {
    const res = await tx.emailJob.updateMany({
      where: { id: job.id, status: { in: ['sent', 'sending'] } },
      data: { status: 'delivered' },
    });
    if (res.count > 0) await this.bump(tx, job, 'deliveredCount');
  }

  private async onBounce(tx: PrismaClient, job: JobRef, ev: NormalizedEvent) {
    const res = await tx.emailJob.updateMany({
      where: { id: job.id, status: { notIn: ['bounced'] } },
      data: { status: 'bounced', error: 'bounced' },
    });
    if (res.count > 0) await this.bump(tx, job, 'bounceCount');

    // Only permanent (hard) bounces suppress. SES marks these 'Permanent';
    // simulator/unknown default to hard to be safe.
    const bounceType = (ev.meta?.bounceType as string) ?? 'Permanent';
    if (bounceType === 'Permanent') {
      await this.suppressAndMarkContact(tx, job, 'hard_bounce', 'bounced');
    }
  }

  private async onComplaint(tx: PrismaClient, job: JobRef) {
    // A complaint doesn't change the email_job send status, so there is no
    // status transition to guard on (unlike delivered/bounce). The natural
    // idempotency anchor is the suppression row: count the complaint ONCE, only
    // when we actually create a new suppression. A re-delivered complaint
    // webhook (realistic for any ESP) then becomes a full no-op.
    const firstTime = await this.suppressAndMarkContact(
      tx,
      job,
      'complaint',
      'complained',
    );
    if (firstTime) await this.bump(tx, job, 'complaintCount');
  }

  private async onOpen(tx: PrismaClient, job: JobRef) {
    await this.bump(tx, job, 'openCount');
    // unique open: only if this contact had no prior 'open' for this campaign
    if (job.campaign_id) {
      const prior = await tx.event.count({
        where: {
          tenantId: job.tenant_id,
          campaignId: job.campaign_id,
          contactId: job.contact_id,
          type: 'open',
        },
      });
      // this call runs AFTER we inserted the current open, so prior includes it
      if (prior <= 1) await this.bump(tx, job, 'uniqueOpenCount');
    }
  }

  private async onClick(tx: PrismaClient, job: JobRef) {
    await this.bump(tx, job, 'clickCount');
  }

  // ---- helpers ----

  private async bump(
    tx: PrismaClient,
    job: JobRef,
    field:
      | 'deliveredCount'
      | 'bounceCount'
      | 'complaintCount'
      | 'openCount'
      | 'uniqueOpenCount'
      | 'clickCount',
  ) {
    if (!job.campaign_id) return;
    await tx.campaignStat.updateMany({
      where: { campaignId: job.campaign_id },
      data: { [field]: { increment: 1 } } as any,
    });
  }

  /**
   * Suppress the contact + mark their status. Returns true only if a NEW
   * suppression row was created (i.e. first time for this email), so callers
   * can make their counters idempotent against duplicate webhooks.
   */
  private async suppressAndMarkContact(
    tx: PrismaClient,
    job: JobRef,
    reason: 'hard_bounce' | 'complaint',
    contactStatus: 'bounced' | 'complained',
  ): Promise<boolean> {
    const contact = await tx.contact.findFirst({
      where: { id: job.contact_id },
      select: { email: true },
    });
    if (!contact) return false;

    const email = contact.email.toLowerCase();
    const exists = await tx.suppression.findFirst({
      where: { email },
      select: { id: true },
    });
    let created = false;
    if (!exists) {
      await tx.suppression.create({
        data: { tenantId: job.tenant_id, email, reason },
      });
      created = true;
    }
    await tx.contact.updateMany({
      where: { id: job.contact_id },
      data: { status: contactStatus },
    });
    return created;
  }
}
