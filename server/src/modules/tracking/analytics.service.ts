import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read-side analytics.
 *
 * ⚠️ CRITICAL: `events` has NO row-level security (it was deliberately excluded
 * from the RLS migration). RLS will NOT scope event reads for us. Therefore
 * EVERY query against `events` here MUST include an explicit tenant_id filter.
 * Aggregate counters come from `campaign_stats` (which IS RLS-scoped), so most
 * numbers are safe by construction; we only touch `events` for time-series and
 * recent-activity, always with tenantId in the WHERE.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /campaigns/:id/analytics — headline stats + derived rates. */
  async campaign(tenantId: string, campaignId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      // campaign is RLS-scoped; 404 if not this tenant's.
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        select: { id: true, name: true, status: true, sentAt: true },
      });
      if (!campaign) throw new NotFoundException('Campaign not found');

      // campaign_stats is RLS-scoped — safe.
      const s = await tx.campaignStat.findFirst({
        where: { campaignId },
      });

      const sent = s?.sentCount ?? 0;
      const delivered = s?.deliveredCount ?? 0;
      const rate = (n: number, d: number) =>
        d > 0 ? Math.round((n / d) * 10000) / 100 : 0; // 2-dp percentage

      return {
        campaign,
        totals: {
          totalRecipients: s?.totalRecipients ?? 0,
          sent,
          delivered,
          opens: s?.openCount ?? 0,
          uniqueOpens: s?.uniqueOpenCount ?? 0,
          clicks: s?.clickCount ?? 0,
          bounces: s?.bounceCount ?? 0,
          complaints: s?.complaintCount ?? 0,
          unsubscribes: s?.unsubscribeCount ?? 0,
        },
        rates: {
          deliveryRate: rate(delivered, sent),
          openRate: rate(s?.uniqueOpenCount ?? 0, delivered),
          clickRate: rate(s?.clickCount ?? 0, delivered),
          bounceRate: rate(s?.bounceCount ?? 0, sent),
          complaintRate: rate(s?.complaintCount ?? 0, delivered),
        },
      };
    });
  }

  /**
   * GET /campaigns/:id/analytics/timeline — event counts per day.
   * Reads `events` directly, so tenant_id is filtered EXPLICITLY (no RLS).
   */
  async timeline(tenantId: string, campaignId: string) {
    // Confirm the campaign belongs to this tenant first (RLS-scoped read).
    const owned = await this.prisma.withCurrentTenant((tx) =>
      tx.campaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        select: { id: true },
      }),
    );
    if (!owned) throw new NotFoundException('Campaign not found');

    // NOTE: tenant_id AND campaign_id both pinned — events has no RLS.
    const rows = await this.prisma.$queryRaw<
      { day: Date; type: string; count: bigint }[]
    >`
      SELECT date_trunc('day', occurred_at) AS day, type, count(*) AS count
      FROM events
      WHERE tenant_id = ${tenantId}::uuid
        AND campaign_id = ${campaignId}::uuid
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      day: r.day,
      type: r.type,
      count: Number(r.count),
    }));
  }
}