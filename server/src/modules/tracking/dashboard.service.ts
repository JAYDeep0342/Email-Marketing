import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardRangeDays } from './dto/dashboard.dto';

/**
 * Tenant-wide dashboard aggregates — the account-level counterpart to
 * AnalyticsService's per-campaign numbers.
 *
 * `campaigns` and `campaign_stats` are both RLS-scoped (FORCE ROW LEVEL
 * SECURITY, tenant_id = app.tenant_id), so a raw join between them inside a
 * withCurrentTenant() transaction is automatically tenant-safe — same trust
 * model AnalyticsService.campaign() already relies on for a plain
 * tx.campaignStat.findFirst(). No relation is declared between Campaign and
 * CampaignStat in schema.prisma (same as Campaign.listId/segmentId), so this
 * is a raw SQL join rather than a Prisma nested-relation query.
 *
 * `events` has NO row-level security (deliberately excluded — see
 * AnalyticsService's own warning), so its query pins tenant_id explicitly,
 * exactly like AnalyticsService.timeline() does.
 */
@Injectable()
export class DashboardAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  // ============================================================
  //  GET /dashboard/overview — account-wide totals + rates for campaigns
  //  SENT within the last `days` days, in one aggregating query.
  // ============================================================
  async overview(days: DashboardRangeDays) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await tx.$queryRaw<
        Array<{
          sent_count: bigint;
          delivered_count: bigint;
          open_count: bigint;
          unique_open_count: bigint;
          click_count: bigint;
          bounce_count: bigint;
          complaint_count: bigint;
        }>
      >`
        SELECT
          COALESCE(SUM(cs.sent_count), 0)        AS sent_count,
          COALESCE(SUM(cs.delivered_count), 0)   AS delivered_count,
          COALESCE(SUM(cs.open_count), 0)        AS open_count,
          COALESCE(SUM(cs.unique_open_count), 0) AS unique_open_count,
          COALESCE(SUM(cs.click_count), 0)       AS click_count,
          COALESCE(SUM(cs.bounce_count), 0)      AS bounce_count,
          COALESCE(SUM(cs.complaint_count), 0)   AS complaint_count
        FROM campaign_stats cs
        JOIN campaigns c ON c.id = cs.campaign_id
        WHERE c.sent_at >= ${since} AND c.deleted_at IS NULL
      `;

      const r = rows[0];
      const totalSent = Number(r.sent_count);
      const delivered = Number(r.delivered_count);
      const opens = Number(r.open_count);
      const uniqueOpens = Number(r.unique_open_count);
      const clicks = Number(r.click_count);
      const bounces = Number(r.bounce_count);
      const complaints = Number(r.complaint_count);

      // Same rate convention as AnalyticsService.campaign(): open/click/
      // complaint rates are of `delivered`, bounce rate is of `sent`.
      const rate = (n: number, d: number) => (d > 0 ? this.round2((n / d) * 100) : 0);

      return {
        range: { days, since: since.toISOString() },
        totals: { totalSent, delivered, opens, uniqueOpens, clicks, bounces, complaints },
        rates: {
          openRate: rate(uniqueOpens, delivered),
          clickRate: rate(clicks, delivered),
          bounceRate: rate(bounces, totalSent),
          complaintRate: rate(complaints, delivered),
        },
      };
    });
  }

  // ============================================================
  //  GET /dashboard/activity — daily send volume, tenant-wide, zero-filled
  //  for days with no sends (a chart needs a continuous series, not gaps).
  //
  //  DELIBERATELY reads email_jobs, not events. Checked first: nothing in
  //  the send pipeline (email.processor.ts, campaign-dispatch.service.ts)
  //  ever inserts a type='sent' row into `events` — tracking-events.service.ts
  //  even says "'sent' handled elsewhere", but "elsewhere" doesn't exist.
  //  Verified live: after a real send, GET .../events-based query returned
  //  all zeros despite campaign_stats.sentCount being 1. email_jobs.sentAt
  //  is the one field the send pipeline actually, reliably sets — same data,
  //  read from where it's actually written. email_jobs IS RLS-scoped (in the FORCE
  //  RLS table list), so this relies on withCurrentTenant() same as
  //  overview()/topCampaigns(), no manual tenant_id pin needed.
  // ============================================================
  async activity(days: DashboardRangeDays) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // status is a progressive lifecycle (sent -> delivered -> bounced/...),
      // so a job that's since been marked delivered no longer has
      // status='sent' even though it genuinely was. sent_at is set once, at
      // the moment of sending, and never cleared by later status changes —
      // that's the correct "was this actually sent" signal, not status.
      const rows = await tx.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', sent_at) AS day, count(*) AS count
        FROM email_jobs
        WHERE sent_at IS NOT NULL
          AND sent_at >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
      return this.zeroFill(rows, days);
    });
  }

  private zeroFill(rows: { day: Date; count: bigint }[], days: DashboardRangeDays) {
    const byDay = new Map(
      rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]),
    );

    // Zero-fill every day in the range so the frontend gets a continuous
    // series regardless of which days actually had sends.
    const series: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, count: byDay.get(key) ?? 0 });
    }
    return series;
  }

  // ============================================================
  //  GET /dashboard/top-campaigns — top N by open rate, server-side sort.
  // ============================================================
  async topCampaigns(limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          sent_count: number;
          delivered_count: number;
          unique_open_count: number;
          open_rate: number;
        }>
      >`
        SELECT
          c.id,
          c.name,
          cs.sent_count,
          cs.delivered_count,
          cs.unique_open_count,
          CASE WHEN cs.delivered_count > 0
            THEN ROUND((cs.unique_open_count::numeric / cs.delivered_count) * 100, 2)
            ELSE 0
          END AS open_rate
        FROM campaigns c
        JOIN campaign_stats cs ON cs.campaign_id = c.id
        WHERE c.deleted_at IS NULL AND cs.sent_count > 0
        ORDER BY open_rate DESC, cs.sent_count DESC
        LIMIT ${limit}
      `;

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        sentCount: Number(r.sent_count),
        openRate: Number(r.open_rate),
      }));
    });
  }
}
