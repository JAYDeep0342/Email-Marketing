import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { SegmentsService } from '../segments/segments.service';

/** Minimal shape this service needs from a loaded campaign row. */
interface CampaignRef {
  id: string;
  tenantId: string;
  listId: string | null;
  segmentId: string | null;
  status: string;
}

interface Candidate {
  id: string;
  email: string;
  status: string;
}

export interface AudienceSummary {
  total: number;
  excluded: {
    unsubscribed: number;
    suppressed: number;
    blacklisted: number;
    duplicates: number;
  };
}

// campaign_recipients insert batch size
const CHUNK = 5000;

@Injectable()
export class CampaignRecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
  ) {}

  // ============================================================
  //  PUBLIC — POST /campaigns/:id/resolve-recipients
  // ============================================================
  async resolve(campaignId: string): Promise<AudienceSummary> {
    return this.prisma.withCurrentTenant(async (tx) => {
      const campaign = await this.loadCampaign(tx, campaignId);
      this.assertResolvable(campaign);
      return this.resolveInTx(tx, campaign);
    });
  }

  // ============================================================
  //  PUBLIC — GET /campaigns/:id/recipients
  // ============================================================
  async list(campaignId: string, page: number, limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.loadCampaign(tx, campaignId);

      const [rows, total] = await Promise.all([
        tx.campaignRecipient.findMany({
          where: { campaignId },
          orderBy: { addedAt: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.campaignRecipient.count({ where: { campaignId } }),
      ]);

      // campaign_recipients has NO relation to contacts in schema.prisma
      // (only tenant + campaign), so contact details are fetched separately.
      // Still RLS-scoped: a foreign contactId simply returns nothing.
      const contacts = await tx.contact.findMany({
        where: { id: { in: rows.map((r) => r.contactId) } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      });
      const byId = new Map(contacts.map((c) => [c.id, c]));

      const data = rows.map((r) => {
        const c = byId.get(r.contactId);
        return {
          contactId: r.contactId,
          email: c?.email ?? null,
          firstName: c?.firstName ?? null,
          lastName: c?.lastName ?? null,
          status: c?.status ?? null,
          addedAt: r.addedAt,
        };
      });

      return paginated(data, total, page, limit);
    });
  }

  // ============================================================
  //  PUBLIC — DELETE /campaigns/:id/recipients/:contactId
  // ============================================================
  async remove(campaignId: string, contactId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const campaign = await this.loadCampaign(tx, campaignId);
      if (campaign.status === 'sending' || campaign.status === 'sent') {
        throw new ConflictException(
          `Cannot change recipients of a campaign with status '${campaign.status}'`,
        );
      }

      const row = await tx.campaignRecipient.findFirst({
        where: { campaignId, contactId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('Recipient not found in this campaign');

      await tx.campaignRecipient.delete({ where: { id: row.id } });
      await this.syncTotal(tx, campaign);
      return { message: 'Recipient removed' };
    });
  }

  // ============================================================
  //  INTERNAL — used by CampaignsService inside its own tx
  // ============================================================

  /**
   * Rebuild the frozen recipient snapshot for a campaign.
   *
   * Runs entirely inside the caller's tenant-scoped tx: delete + insert are
   * atomic, so a half-resolved audience is never observable.
   */
  async resolveInTx(
    tx: PrismaClient,
    campaign: CampaignRef,
  ): Promise<AudienceSummary> {
    // ---- 1. gather candidates from list and/or segment ----
    let fromList: Candidate[] = [];
    let fromSegment: Candidate[] = [];

    if (campaign.listId) {
      // Validate the list is visible to THIS tenant. list_id has no FK in the
      // schema, so this app-level check is the only guard (see plan Finding #3).
      const list = await tx.list.findFirst({
        where: { id: campaign.listId },
        select: { id: true },
      });
      if (!list) throw new NotFoundException('List not found');

      fromList = (await tx.contact.findMany({
        where: {
          deletedAt: null,
          listContacts: { some: { listId: campaign.listId } },
        },
        select: { id: true, email: true, status: true },
      })) as Candidate[];
    }

    if (campaign.segmentId) {
      // Same: segment_id has no FK. resolveContacts() itself 404s if the
      // segment isn't visible in this tenant.
      fromSegment = await this.segments.resolveContacts(tx, campaign.segmentId);
    }

    // ---- 2. union + dedupe ----
    const union = new Map<string, Candidate>();
    for (const c of [...fromList, ...fromSegment]) union.set(c.id, c);
    const duplicates = fromList.length + fromSegment.length - union.size;

    // ---- 3. status filter (only 'subscribed' can be mailed) ----
    const subscribed: Candidate[] = [];
    let unsubscribed = 0;
    for (const c of union.values()) {
      if (c.status === 'subscribed') subscribed.push(c);
      else unsubscribed += 1;
    }

    // ---- 4. suppression list ----
    const supRows = await tx.suppression.findMany({ select: { email: true } });
    const supSet = new Set(supRows.map((s) => s.email.toLowerCase()));

    const afterSup: Candidate[] = [];
    let suppressed = 0;
    for (const c of subscribed) {
      if (supSet.has(c.email.toLowerCase())) suppressed += 1;
      else afterSup.push(c);
    }

    // ---- 5. blacklist (email + domain scope) ----
    // NOTE: whether GLOBAL blacklist rows (tenant_id IS NULL) are visible here
    // depends on whether `blacklist` got the split-policy RLS treatment. If it
    // still has a plain tenant_isolation policy, only this tenant's rows are
    // returned and global entries are silently skipped. That is safe (fails
    // open on filtering, never leaks data) and is tracked for the Sending
    // Engine step — do NOT add a migration for it here.
    const blRows = await tx.blacklist.findMany({
      select: { value: true, scope: true },
    });
    const blEmails = new Set<string>();
    const blDomains = new Set<string>();
    for (const b of blRows) {
      const v = b.value.toLowerCase();
      if (b.scope === 'domain') blDomains.add(v.replace(/^@/, ''));
      else blEmails.add(v);
    }

    const eligible: Candidate[] = [];
    let blacklisted = 0;
    for (const c of afterSup) {
      const email = c.email.toLowerCase();
      const domain = email.slice(email.indexOf('@') + 1);
      if (blEmails.has(email) || blDomains.has(domain)) blacklisted += 1;
      else eligible.push(c);
    }

    // ---- 6. replace the snapshot ----
    await tx.campaignRecipient.deleteMany({ where: { campaignId: campaign.id } });

    for (let i = 0; i < eligible.length; i += CHUNK) {
      const slice = eligible.slice(i, i + CHUNK);
      await tx.campaignRecipient.createMany({
        data: slice.map((c) => ({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          contactId: c.id,
        })),
        skipDuplicates: true,
      });
    }

    // ---- 7. keep campaign_stats.totalRecipients in sync ----
    await tx.campaignStat.upsert({
      where: { campaignId: campaign.id },
      create: {
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        totalRecipients: eligible.length,
      },
      update: { totalRecipients: eligible.length },
    });

    return {
      total: eligible.length,
      excluded: { unsubscribed, suppressed, blacklisted, duplicates },
    };
  }

  // ============================================================
  //  helpers
  // ============================================================

  private async loadCampaign(
    tx: PrismaClient,
    id: string,
  ): Promise<CampaignRef> {
    const c = await tx.campaign.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        listId: true,
        segmentId: true,
        status: true,
      },
    });
    if (!c) throw new NotFoundException('Campaign not found');
    return c as CampaignRef;
  }

  private assertResolvable(campaign: CampaignRef) {
    if (['sending', 'sent', 'cancelled'].includes(campaign.status)) {
      throw new ConflictException(
        `Cannot resolve recipients for a campaign with status '${campaign.status}'`,
      );
    }
  }

  private async syncTotal(tx: PrismaClient, campaign: CampaignRef) {
    const total = await tx.campaignRecipient.count({
      where: { campaignId: campaign.id },
    });
    await tx.campaignStat.upsert({
      where: { campaignId: campaign.id },
      create: {
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        totalRecipients: total,
      },
      update: { totalRecipients: total },
    });
  }
}