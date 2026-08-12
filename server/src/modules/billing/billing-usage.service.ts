import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { USAGE_METRICS, UsageMetric } from './billing.constants';

/**
 * Records metered usage against the current period. Only used for time-windowed
 * metrics (emails_day / emails_month) â point-in-time metrics (contacts, lists,
 * ...) are counted directly by the guard at check time.
 *
 * Design: one row per (tenant, metric, periodStart) â the schema already has
 * that unique index. We upsert atomically so parallel sends don't lose an
 * increment.
 *
 * Called from EmailProcessor.process() AFTER a successful send. On a send
 * failure we do NOT decrement â we count attempts against the customer's
 * quota, same as every ESP. (An overquota tenant retrying failing sends can
 * exhaust their own limit; that's the correct behaviour.)
 */
@Injectable()
export class BillingUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async increment(tenantId: string, metric: UsageMetric, by = 1) {
    // Only bump the time-windowed metrics through here â the point-in-time
    // ones (contacts, campaigns, ...) are always live-counted, so writing
    // to usage_records for them would just be dead data.
    if (
      metric !== USAGE_METRICS.EMAILS_MONTH &&
      metric !== USAGE_METRICS.EMAILS_DAY
    ) {
      return;
    }

    const now = new Date();
    const periodStart =
      metric === USAGE_METRICS.EMAILS_MONTH
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        : new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          );

    await this.prisma.usageRecord.upsert({
      where: {
        tenantId_metric_periodStart: { tenantId, metric, periodStart },
      },
      update: { quantity: { increment: by } },
      create: { tenantId, metric, periodStart, quantity: by },
    });
  }

  // Called from EmailProcessor after a successful send â bumps both windows
  // in one call. Kept as a convenience so downstream code doesn't have to
  // remember to hit both.
  async recordEmailSent(tenantId: string) {
    await this.increment(tenantId, USAGE_METRICS.EMAILS_DAY, 1);
    await this.increment(tenantId, USAGE_METRICS.EMAILS_MONTH, 1);
  }
}
