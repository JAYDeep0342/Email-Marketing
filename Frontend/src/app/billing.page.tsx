import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CancelSubscriptionDialog } from '@/features/billing/cancel-subscription-dialog';
import { Plan } from '@/features/billing/billing.api';
import { useCreateCheckout, usePlans } from '@/features/billing/use-billing';
import { useSubscription } from '@/features/billing/use-subscription';
import type { SubscriptionStatus } from '@/types/api';

const STATUS_BADGE_VARIANT: Record<
  SubscriptionStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  trialing: 'outline',
  active: 'default',
  past_due: 'destructive',
  cancelled: 'secondary',
  unpaid: 'destructive',
  ended: 'secondary',
  pending: 'secondary',
};

function formatPrice(priceCents: number, symbol: string | undefined) {
  return `${symbol ?? ''}${(priceCents / 100).toFixed(2)}`;
}

export default function BillingPage() {
  const { data: subscription, isLoading: isSubLoading } = useSubscription();
  const plansQuery = usePlans();
  const checkoutMutation = useCreateCheckout();
  const [cancelOpen, setCancelOpen] = useState(false);

  const canCancel =
    !!subscription &&
    ['trialing', 'active', 'past_due'].includes(subscription.status) &&
    !subscription.cancelAtPeriodEnd;

  const handleSubscribe = (plan: Plan) => {
    checkoutMutation.mutate(plan.id, {
      onSuccess: (result) => {
        // Real redirect to the Razorpay-hosted checkout page — this leaves
        // the SPA entirely, same as any hosted-checkout flow.
        window.location.href = result.checkoutUrl;
      },
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Current subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {isSubLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isSubLoading && !subscription && (
            <p className="text-sm text-muted-foreground">
              No active subscription — pick a plan below to get started.
            </p>
          )}
          {subscription && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{subscription.plan?.name ?? 'Unknown plan'}</span>
                <Badge variant={STATUS_BADGE_VARIANT[subscription.status]}>
                  {subscription.status}
                </Badge>
                {subscription.cancelAtPeriodEnd && (
                  <Badge variant="outline">Cancels at period end</Badge>
                )}
              </div>
              {subscription.currentPeriodEnd && (
                <p className="text-muted-foreground">
                  {subscription.status === 'trialing' ? 'Trial ends' : 'Renews'}{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              {canCancel && (
                <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancel subscription
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Plans</h2>
        {plansQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {plansQuery.isError && (
          <p className="text-sm text-destructive">Couldn't load plans.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(plansQuery.data ?? []).map((plan) => {
            const isCurrent = subscription?.plan?.id === plan.id;
            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary' : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">{plan.name}</CardTitle>
                    {isCurrent && <Badge>Current plan</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold">
                    {formatPrice(plan.priceCents, plan.currency?.symbol)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{plan.billingPeriod === 'yearly' ? 'yr' : 'mo'}
                    </span>
                  </p>
                  {plan.planLimit && (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>{formatLimit(plan.planLimit.maxContacts)} contacts</li>
                      <li>{formatLimit(plan.planLimit.maxEmailsMonth)} emails/month</li>
                      <li>{formatLimit(plan.planLimit.maxCampaigns)} campaigns</li>
                      <li>{formatLimit(plan.planLimit.maxAutomations)} automations</li>
                      {plan.planLimit.aiEnabled && <li>AI features included</li>}
                      {plan.planLimit.dedicatedIp && <li>Dedicated IP</li>}
                    </ul>
                  )}
                  <Button
                    className="w-full"
                    disabled={isCurrent || checkoutMutation.isPending}
                    onClick={() => handleSubscribe(plan)}
                  >
                    {isCurrent
                      ? 'Current plan'
                      : checkoutMutation.isPending
                        ? 'Redirecting…'
                        : 'Subscribe'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <CancelSubscriptionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        planName={subscription?.plan?.name}
      />
    </div>
  );
}

function formatLimit(n: number | null) {
  return n === null ? 'Unlimited' : n.toLocaleString();
}
