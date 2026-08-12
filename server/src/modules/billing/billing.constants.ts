// ============================================================
//  Billing constants
// ============================================================

// Trial length. Kept in one place so signup + trial-expiry watchdog agree.
export const TRIAL_DAYS = 14;

// Placeholder plan codes for the seed. Super admin can rename/reprice these
// later without code changes â plan_gating reads by tenant.planId, not code.
// Trial is NOT a plan â it's a Subscription with status='trialing' pointing
// at whatever plan the admin marks as the "default trial plan" (highest tier
// in the seed below, per the "full-access trial" decision).
export const PLAN_CODES = {
  STARTER: 'starter',
  PRO: 'pro',
  BUSINESS: 'business',
} as const;

// Razorpay webhook event names we actually handle. Anything not in this
// allow-list gets a 200 (acknowledged) but is otherwise ignored â Razorpay
// keeps re-delivering unacknowledged webhooks, so we NEVER 4xx them.
export const RAZORPAY_EVENTS = {
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  SUBSCRIPTION_CHARGED: 'subscription.charged',
  SUBSCRIPTION_PENDING: 'subscription.pending',
  SUBSCRIPTION_HALTED: 'subscription.halted',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_COMPLETED: 'subscription.completed',
  PAYMENT_FAILED: 'payment.failed',
} as const;

// Metric names used by @CheckQuota() and UsageRecord.metric. String literals
// (not an enum) so downstream services can add metrics without a migration.
export const USAGE_METRICS = {
  CONTACTS: 'contacts',
  EMAILS_MONTH: 'emails_month',
  EMAILS_DAY: 'emails_day',
  CAMPAIGNS: 'campaigns',
  AUTOMATIONS: 'automations',
  LISTS: 'lists',
  USERS: 'users',
} as const;
export type UsageMetric = (typeof USAGE_METRICS)[keyof typeof USAGE_METRICS];

// Which PlanLimit column each metric maps to. Central so the gating guard
// doesn't have to switch/case in-line.
export const METRIC_TO_LIMIT_FIELD: Record<UsageMetric, keyof {
  maxContacts: number | null;
  maxEmailsMonth: number | null;
  maxEmailsDay: number | null;
  maxCampaigns: number | null;
  maxAutomations: number | null;
  maxLists: number | null;
  maxUsers: number | null;
}> = {
  contacts: 'maxContacts',
  emails_month: 'maxEmailsMonth',
  emails_day: 'maxEmailsDay',
  campaigns: 'maxCampaigns',
  automations: 'maxAutomations',
  lists: 'maxLists',
  users: 'maxUsers',
};

// Grace period after a failed renewal before we hard-freeze the tenant.
// Razorpay's own dunning already retries; this is our extra buffer.
export const PAST_DUE_GRACE_DAYS = 7;
