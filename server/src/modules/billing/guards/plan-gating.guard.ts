import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  METRIC_TO_LIMIT_FIELD,
  USAGE_METRICS,
  UsageMetric,
} from '../billing.constants';
import {
  CHECK_QUOTA_KEY,
  REQUIRES_FEATURE_KEY,
} from '../decorators/plan-gating.decorators';

/**
 * Enforces plan gating on decorated routes.
 *
 * Placement: this guard runs AFTER JwtAuthGuard (so request.tenantId exists)
 * and BEFORE controllers. Registered globally via APP_GUARD in BillingModule.
 *
 * Fail-closed philosophy:
 *   - No tenant on request  -> pass (route wasn't auth'd anyway; JwtAuthGuard
 *                              would have blocked it if @Public wasn't set)
 *   - No effective plan     -> BLOCK (tenant is frozen â trial expired, unpaid)
 *   - No PlanLimit row      -> BLOCK (misconfig; better to alert than to leak)
 *   - Metric usage >= limit -> BLOCK
 *
 * The one soft rule: null in PlanLimit.maxXxx means UNLIMITED (business-tier
 * pattern). null usage means zero.
 */
@Injectable()
export class PlanGatingGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const quota = this.reflector.getAllAndOverride<{
      metric: UsageMetric;
      unit: number | ((ctx: ExecutionContext) => number);
    } | null>(CHECK_QUOTA_KEY, [ctx.getHandler(), ctx.getClass()]);

    const feature = this.reflector.getAllAndOverride<
      'aiEnabled' | 'dedicatedIp' | null
    >(REQUIRES_FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);

    // No gating decorator on this route -> nothing to check.
    if (!quota && !feature) return true;

    const req = ctx.switchToHttp().getRequest();
    const tenantId = req.tenantId as string | undefined;
    if (!tenantId) return true; // unauth'd route or admin route without tenant

    // Load tenant + effective plan + limits in ONE query.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        planId: true,
        plan: {
          select: {
            id: true,
            code: true,
            planLimit: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    // Tenant-level suspension shortcut â set by super admin or trial-expiry
    // watchdog. Nothing gets past this.
    if (tenant.status !== 'active') {
      throw new ForbiddenException({
        code: 'TENANT_SUSPENDED',
        message: 'Your account is suspended. Contact support.',
      });
    }

    // No effective plan = frozen. This is what a hard-freezed trial looks like.
    if (!tenant.planId || !tenant.plan) {
      throw new ForbiddenException({
        code: 'NO_ACTIVE_PLAN',
        message:
          'Your trial has ended or your subscription is inactive. Choose a plan to continue.',
      });
    }

    const limit = tenant.plan.planLimit;
    if (!limit) {
      // A plan without a PlanLimit is a misconfig. Fail closed rather than
      // silently uncap gated features.
      throw new ForbiddenException({
        code: 'PLAN_MISCONFIGURED',
        message: 'Plan limits are not configured. Contact support.',
      });
    }

    // Feature gate.
    if (feature && limit[feature] !== true) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_AVAILABLE',
        message: `Your plan does not include this feature (${feature}).`,
      });
    }

    // Quota gate.
    if (quota) {
      const unit =
        typeof quota.unit === 'function' ? quota.unit(ctx) : quota.unit;
      const limitField = METRIC_TO_LIMIT_FIELD[quota.metric];
      const cap = (limit as any)[limitField] as number | null;
      if (cap !== null && cap !== undefined) {
        const used = await this.currentUsage(tenantId, quota.metric);
        if (used + unit > cap) {
          throw new ForbiddenException({
            code: 'QUOTA_EXCEEDED',
            message: `You have reached your plan's ${quota.metric} limit (${cap}). Upgrade to continue.`,
            details: { metric: quota.metric, used, cap, requested: unit },
          });
        }
      }
    }

    return true;
  }

  /**
   * Current usage for a metric in the RIGHT window:
   *   contacts / campaigns / automations / lists / users -> lifetime count
   *   emails_month -> current calendar month's UsageRecord.quantity
   *   emails_day   -> current calendar day's UsageRecord.quantity
   */
  private async currentUsage(
    tenantId: string,
    metric: UsageMetric,
  ): Promise<number> {
    // Every table touched here (usage_records, contacts, campaigns,
    // automations, lists, users) is under FORCE ROW LEVEL SECURITY — a
    // `where: { tenantId }` filter alone does NOT satisfy that policy, only
    // `app.tenant_id` being set does. So this whole read runs inside
    // withTenant(), same as every other tenant-scoped read in the app.
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Time-window metrics come from usage_records.
      if (
        metric === USAGE_METRICS.EMAILS_MONTH ||
        metric === USAGE_METRICS.EMAILS_DAY
      ) {
        const now = new Date();
        const periodStart =
          metric === USAGE_METRICS.EMAILS_MONTH
            ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
            : new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
              );
        const row = await tx.usageRecord.findFirst({
          where: { tenantId, metric, periodStart },
          select: { quantity: true },
        });
        return row ? Number(row.quantity) : 0;
      }

      // Point-in-time counts — direct table count is fine at this scale.
      switch (metric) {
        case USAGE_METRICS.CONTACTS:
          return tx.contact.count({
            where: { tenantId, deletedAt: null },
          });
        case USAGE_METRICS.CAMPAIGNS:
          return tx.campaign.count({ where: { tenantId } });
        case USAGE_METRICS.AUTOMATIONS:
          return tx.automation.count({ where: { tenantId } });
        case USAGE_METRICS.LISTS:
          return tx.list.count({ where: { tenantId } });
        case USAGE_METRICS.USERS:
          return tx.user.count({ where: { tenantId } });
        default:
          return 0;
      }
    });
  }
}
