import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PlansController, AdminPlansController } from './plans.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { BillingWebhookController } from './billing-webhook.controller';

import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { RazorpayService } from './razorpay.service';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingUsageService } from './billing-usage.service';
import { TrialWatchdogService } from './trial-watchdog.service';
import { PlanGatingGuard } from './guards/plan-gating.guard';

/**
 * Billing (Step 16A).
 *
 * PrismaModule is @Global â no import. This module owns:
 *   - Plans CRUD (public + admin)
 *   - Subscriptions (current, checkout, cancel)
 *   - Razorpay integration + webhook
 *   - Plan-gating guard (registered globally)
 *   - Trial expiry watchdog
 *   - Usage tracking (called by EmailProcessor)
 *
 * Exports:
 *   - SubscriptionsService â for AuthService.signup() to call startTrial()
 *   - BillingUsageService â for EmailProcessor to call recordEmailSent()
 *   - PlansService â reserved for platform-admin cross-imports (Step 20)
 */
@Module({
  controllers: [
    PlansController,
    AdminPlansController,
    SubscriptionsController,
    BillingWebhookController,
  ],
  providers: [
    PlansService,
    SubscriptionsService,
    RazorpayService,
    BillingWebhookService,
    BillingUsageService,
    TrialWatchdogService,
    // Global gating â every route that has @CheckQuota / @RequiresFeature
    // gets enforced automatically.
    { provide: APP_GUARD, useClass: PlanGatingGuard },
  ],
  exports: [SubscriptionsService, BillingUsageService, PlansService],
})
export class BillingModule {}
