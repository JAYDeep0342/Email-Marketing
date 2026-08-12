import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Trial expiry watchdog.
 *
 * Runs every hour (setInterval, same style as AutomationRunnerService).
 * For every subscription with status='trialing' AND currentPeriodEnd < now:
 *   - Subscription.status -> 'ended', endedAt=now
 *   - Tenant.planId       -> null (hard freeze per the design decision)
 *
 * A trial-expired tenant sees NO_ACTIVE_PLAN on every gated route until they
 * subscribe. Existing data is preserved â only writes are blocked.
 *
 * Idempotent: the query is `status='trialing' AND currentPeriodEnd < now`
 * so a second pass won't re-process already-ended rows.
 */
@Injectable()
export class TrialWatchdogService implements OnModuleInit {
  private readonly logger = new Logger(TrialWatchdogService.name);
  private readonly intervalMs = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onModuleInit() {
    // Delay first run 30s so the app finishes boot before hitting the DB.
    setTimeout(() => this.tick(), 30_000);
    setInterval(() => this.tick(), this.intervalMs);
    this.logger.log(`Trial expiry watchdog registered (every ${this.intervalMs / 60_000} min)`);
  }

  async tick() {
    try {
      const now = new Date();
      // `subscriptions` is FORCE RLS — this is an inherently cross-tenant
      // scan (find every expired trial regardless of tenant), so it goes
      // through a SECURITY DEFINER function, same pattern as
      // automation_due_runs() / sending_orphaned_campaigns().
      const expired = await this.prisma.$queryRaw<
        Array<{ id: string; tenant_id: string }>
      >`SELECT id, tenant_id FROM billing_expired_trials()`;

      if (expired.length === 0) return;
      this.logger.log(`Expiring ${expired.length} trial subscription(s)`);

      for (const row of expired) {
        const sub = { id: row.id, tenantId: row.tenant_id };
        try {
          await this.prisma.withTenant(sub.tenantId, (tx) =>
            this.subscriptions.applyEffectivePlan(tx, sub.tenantId, {
              subscriptionId: sub.id,
              status: 'ended',
              endedAt: now,
              nextPlanIdForTenant: null, // hard freeze
            }),
          );
        } catch (e) {
          // Don't let one bad row abort the batch â same isolation pattern
          // as the automation runner.
          this.logger.error(
            `Failed to expire trial ${sub.id}: ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      this.logger.error(`Trial watchdog tick failed: ${(e as Error).message}`);
    }
  }
}
