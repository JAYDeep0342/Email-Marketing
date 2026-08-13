import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClient } from '../../generated/prisma/client';
import { RazorpayService } from './razorpay.service';
import { TRIAL_DAYS } from './billing.constants';

/**
 * Subscription lifecycle. All tenant-scoped operations go through
 * withCurrentTenant; the trial-start path is called from the signup flow
 * with an explicit tenantId (no CLS yet at that point).
 *
 * DESIGN â dual write on planId:
 *   Tenant.planId is a fast-path cache used by the plan-gating guard on
 *   every gated request. Subscription.planId is the source of truth for
 *   what's being billed. They MUST stay in sync â every write goes through
 *   applyEffectivePlan() which updates both in a single tx.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
  ) {}

  // ============================================================
  //  Read
  // ============================================================

  // Current active subscription for the caller. There should never be more
  // than one non-ended row per tenant â status in ('trialing','active',
  // 'past_due','unpaid','pending') all count as "current". Ordered so a
  // trialing row wins over an ended one if the DB is ever out of shape.
  async getCurrent() {
    return this.prisma.withCurrentTenant(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: {
          status: {
            in: ['trialing', 'active', 'past_due', 'unpaid', 'pending'],
          },
        },
        orderBy: { subscribedAt: 'desc' },
        include: { plan: { include: { planLimit: true } } },
      });
      // Not an error â a freshly-created tenant may not have hit the trial-
      // start path yet (e.g. legacy tenants pre-Step 16). Frontend treats
      // null as "no subscription".
      return sub;
    });
  }

  // ============================================================
  //  Trial start â called from AuthService.signup() with the fresh tenantId
  // ============================================================

  async startTrial(tenantId: string) {
    // Pick the "trial plan" = the highest-tier active plan (full-access
    // per the design decision). If no plan is seeded yet, we still create
    // the tenant but skip subscription creation â the guard treats a null
    // subscription as "no access" which naturally hard-freezes them until
    // the super admin creates a plan.
    const trialPlan = await this.prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: { priceCents: 'desc' },
    });
    if (!trialPlan) {
      this.logger.warn(
        `startTrial for tenant ${tenantId}: no active plan seeded, skipping`,
      );
      return null;
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    return this.prisma.withTenant(tenantId, async (tx) => {
      // Idempotent: if a trial subscription already exists (retry / duplicate
      // signup handler), don't create a second one.
      const existing = await tx.subscription.findFirst({
        where: { tenantId, status: { in: ['trialing', 'active'] } },
      });
      if (existing) return existing;

      const sub = await tx.subscription.create({
        data: {
          tenantId,
          planId: trialPlan.id,
          provider: null, // no provider yet â no card on file
          status: 'trialing',
          isRecurring: false, // won't auto-renew; user must convert to paid
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
        },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { planId: trialPlan.id },
      });
      return sub;
    });
  }

  // ============================================================
  //  Checkout â user picks a paid plan, we hand back a Razorpay-hosted URL
  // ============================================================

  async createCheckout(tenantId: string, planId: string) {
    // Look up the plan (platform-level, no RLS). Validate it's real & active
    // BEFORE calling Razorpay, so we don't burn an API call on a bad plan id.
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: { planLimit: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.isActive) {
      throw new BadRequestException('Plan is not available for subscription');
    }

    // Razorpay Plan ID lookup. The super admin sets this via
    // platform_settings.key='razorpay.plan_map' -> { [ourPlanId]: rzpPlanId }.
    // Kept out of the Plan schema to avoid a migration; it's a config concern.
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: 'razorpay.plan_map' },
    });
    const planMap = (setting?.value ?? {}) as Record<string, string>;
    const razorpayPlanId = planMap[planId];
    if (!razorpayPlanId) {
      throw new BadRequestException(
        'This plan is not mapped to a Razorpay plan yet. Ask an admin to configure razorpay.plan_map.',
      );
    }

    const rzpSub = await this.razorpay.createSubscription({
      razorpayPlanId,
      totalCount: 120, // 10 years of monthly cycles â effectively "until cancelled"
      customerNotify: true,
      notes: { tenantId, planId },
    });

    // Create a local `pending` subscription so the webhook has a row to
    // upgrade to `active`. If the user never completes checkout, this row
    // stays `pending` and is cleaned up by the reconciliation watchdog (v2).
    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.subscription.create({
        data: {
          tenantId,
          planId,
          provider: 'razorpay',
          providerSubId: rzpSub.id,
          status: 'pending',
          isRecurring: true,
        },
      });
    });

    return { checkoutUrl: rzpSub.short_url, razorpaySubscriptionId: rzpSub.id };
  }

  // ============================================================
  //  Cancel â cancels at period end, doesn't yank access mid-period
  // ============================================================

  async cancel() {
    return this.prisma.withCurrentTenant(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { status: { in: ['trialing', 'active', 'past_due'] } },
        orderBy: { subscribedAt: 'desc' },
      });
      if (!sub) throw new NotFoundException('No active subscription to cancel');

      // Trial cancel = end it immediately (no Razorpay side, no money at stake).
      if (sub.status === 'trialing') {
        await this.applyEffectivePlan(tx, sub.tenantId, {
          subscriptionId: sub.id,
          status: 'ended',
          endedAt: new Date(),
          nextPlanIdForTenant: null, // hard-freeze on trial cancel
        });
        return { message: 'Trial ended' };
      }

      // Paid cancel = tell Razorpay to stop recurring at period end. User
      // keeps access until currentPeriodEnd; the webhook will flip us to
      // 'cancelled' -> 'ended' at that point.
      if (sub.provider === 'razorpay' && sub.providerSubId) {
        await this.razorpay.cancelSubscription(sub.providerSubId, true);
      }
      await tx.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: true },
      });
      return {
        message:
          'Subscription will end at the current period. You keep access until then.',
      };
    });
  }

  // ============================================================
  //  Helper â the ONLY place Tenant.planId and Subscription.status should
  //  change in tandem. Used by trial start, webhook handlers, cancel, and
  //  the trial-expiry watchdog.
  // ============================================================

  async applyEffectivePlan(
    tx: PrismaClient,
    tenantId: string,
    change: {
      subscriptionId: string;
      status?:
        | 'trialing'
        | 'active'
        | 'past_due'
        | 'cancelled'
        | 'unpaid'
        | 'ended'
        | 'pending';
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      endedAt?: Date | null;
      // What Tenant.planId should be after this change:
      //   a plan id  -> tenant has that plan (active or trialing)
      //   null       -> tenant is frozen (no gated features)
      //   undefined  -> leave Tenant.planId alone (mid-cycle status flip)
      nextPlanIdForTenant?: string | null;
    },
  ) {
    await tx.subscription.update({
      where: { id: change.subscriptionId },
      data: {
        ...(change.status !== undefined ? { status: change.status } : {}),
        ...(change.currentPeriodStart !== undefined
          ? { currentPeriodStart: change.currentPeriodStart }
          : {}),
        ...(change.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: change.currentPeriodEnd }
          : {}),
        ...(change.endedAt !== undefined ? { endedAt: change.endedAt } : {}),
      },
    });

    if (change.nextPlanIdForTenant !== undefined) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { planId: change.nextPlanIdForTenant },
      });
    }
  }
}
