import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBannerState } from './banner-state';
import { useSubscription } from './use-subscription';

const STYLES: Record<string, string> = {
  trial: 'bg-primary/10 text-primary border-primary/20',
  trial_urgent: 'bg-destructive/10 text-destructive border-destructive/20',
  past_due: 'bg-destructive/10 text-destructive border-destructive/20',
  expired: 'bg-muted text-muted-foreground border-border',
  frozen: 'bg-destructive/10 text-destructive border-destructive/20',
};

/**
 * Top-of-app banner strip driven by getBannerState() (features/billing/
 * banner-state.ts) — that helper already existed, built ahead of the screen
 * that would consume it. This is that consumer, mounted in AppLayout.
 */
export function SubscriptionBanner() {
  const { data: subscription } = useSubscription();
  const state = getBannerState(subscription);
  if (!state) return null;

  const styleKey = state.kind === 'trial' && state.urgent ? 'trial_urgent' : state.kind;
  const message =
    state.kind === 'trial'
      ? state.daysLeft <= 0
        ? 'Your trial ends today.'
        : `Your trial ends in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}.`
      : state.kind === 'past_due'
        ? 'Your last payment failed — update billing to avoid losing access.'
        : state.kind === 'frozen'
          ? 'Your account is frozen — subscribe to a plan to regain access.'
          : 'Your trial has ended — subscribe to a plan to continue.';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b px-4 py-2 text-sm',
        STYLES[styleKey],
      )}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      <Link to="/app/billing" className="whitespace-nowrap font-medium underline underline-offset-2">
        View plans
      </Link>
    </div>
  );
}
