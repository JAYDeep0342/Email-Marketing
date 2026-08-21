import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { UsageMetric } from '../billing.constants';

export const CHECK_QUOTA_KEY = 'billing:check_quota';
export const REQUIRES_FEATURE_KEY = 'billing:requires_feature';

/**
 * `unit` can be a static number, or a function resolved at request time
 * against the full ExecutionContext — for a route whose consumption depends
 * on the request body (e.g. a bulk import), a static number can't express
 * "however many rows are in this request." Same pattern as @nestjs/throttler's
 * `Resolvable<T>`.
 */
export type QuotaUnit = number | ((ctx: ExecutionContext) => number);

/**
 * Mark a route as consuming a metered quota. The PlanGatingGuard checks:
 *   1. Tenant has an effective plan and it's not frozen.
 *   2. Current usage for `metric` (in this billing period) is below the plan's
 *      limit â null means unlimited.
 *
 * Usage:
 *   @CheckQuota('emails_month')
 *   @Post('campaigns/:id/send')
 *   send(...) { ... }
 *
 * `unit` (default 1) is how much this ONE call will consume â for a campaign
 * send, callers can override to the recipient count via a request-time hook
 * (see billing-usage.service for the increment path).
 */
export const CheckQuota = (metric: UsageMetric, unit: QuotaUnit = 1) =>
  SetMetadata(CHECK_QUOTA_KEY, { metric, unit });

/**
 * Require a boolean feature flag from PlanLimit (aiEnabled, dedicatedIp, ...).
 *
 * Usage:
 *   @RequiresFeature('aiEnabled')
 *   @Post('ai/generate')
 *   generate(...) { ... }
 */
export const RequiresFeature = (feature: 'aiEnabled' | 'dedicatedIp') =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);
