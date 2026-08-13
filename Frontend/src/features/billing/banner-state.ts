import type { Subscription } from '@/types/api';

/**
 * Derives the "what banner should we show?" state from a Subscription.
 *
 * Kept as a pure function (not a hook) so the same logic drives multiple
 * UI surfaces: the top-bar banner strip, the dashboard trial-widget, and
 * future locations like the campaign-send guard.
 *
 * Returns null when no banner is needed (healthy active paid subscription).
 */

export type BannerState =
  | { kind: 'trial'; daysLeft: number; urgent: boolean }   // trialing, count down
  | { kind: 'expired' }                                     // trial ended, no paid plan
  | { kind: 'past_due' }                                    // paid but renewal failing
  | { kind: 'frozen' }                                      // unpaid / halted — hard freeze
  | null;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function getBannerState(sub: Subscription | null | undefined): BannerState {
  if (!sub) {
    // No subscription at all — treat as expired so the user is nudged to
    // pick a plan. This is what a fully-frozen tenant looks like from
    // the frontend's POV.
    return { kind: 'expired' };
  }

  switch (sub.status) {
    case 'trialing': {
      const days = daysUntil(sub.currentPeriodEnd);
      return {
        kind: 'trial',
        daysLeft: Math.max(0, days),
        // 3 days or less: raise the visual urgency (amber -> red)
        urgent: days <= 3,
      };
    }
    case 'past_due':
      return { kind: 'past_due' };
    case 'unpaid':
    case 'ended':
    case 'cancelled':
      return { kind: 'frozen' };
    case 'active':
    case 'pending':
    default:
      // Active paid sub, or an in-flight checkout — no banner.
      return null;
  }
}

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((then - now) / MS_PER_DAY);
}
