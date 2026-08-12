import { SetMetadata } from '@nestjs/common';
import { UsageMetric } from '../billing.constants';

export const CHECK_QUOTA_KEY = 'billing:check_quota';
export const REQUIRES_FEATURE_KEY = 'billing:requires_feature';

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
export const CheckQuota = (metric: UsageMetric, unit = 1) =>
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
