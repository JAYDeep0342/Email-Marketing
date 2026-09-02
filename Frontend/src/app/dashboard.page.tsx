import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth.store';
import { useContactsList } from '@/features/contacts/use-contacts';
import { useListsList } from '@/features/lists/use-lists';
import { useCampaignsList } from '@/features/campaigns/use-campaigns';
import { CampaignStatus } from '@/features/campaigns/campaigns.api';
import { useSubscription } from '@/features/billing/use-subscription';

const STATUS_BADGE_VARIANT: Record<
  CampaignStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  scheduled: 'outline',
  sending: 'default',
  sent: 'default',
  paused: 'secondary',
  cancelled: 'destructive',
};

/**
 * Dashboard overview. Every number here comes from an endpoint that already
 * exists for its own screen — contacts/lists/campaigns totals are read off
 * each list query's `meta.total` (a page-size-1 fetch), and "recent
 * campaigns" reuses the same GET /campaigns list (already sorted newest
 * first) rather than a dedicated dashboard endpoint. Per-campaign send
 * analytics (opens/clicks/etc.) are deliberately NOT fetched here — that
 * would be 1 extra call per row shown; recipientCount + status from the
 * list endpoint is enough for an at-a-glance widget, and the full picture
 * is one click away on each campaign's own detail page.
 */
export default function DashboardPage() {
  const { user } = useAuthStore();

  const contactsQuery = useContactsList({ page: 1, limit: 1 });
  const listsQuery = useListsList({ page: 1, limit: 1 });
  const campaignsQuery = useCampaignsList({ page: 1, limit: 1 });
  const recentCampaignsQuery = useCampaignsList({ page: 1, limit: 5 });
  const { data: subscription, isLoading: isSubLoading } = useSubscription();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        Welcome{user?.firstName ? `, ${user.firstName}` : ''}
      </h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Contacts"
          value={contactsQuery.meta?.total}
          isLoading={contactsQuery.isLoading}
          to="/app/contacts"
        />
        <StatCard
          label="Lists"
          value={listsQuery.meta?.total}
          isLoading={listsQuery.isLoading}
          to="/app/lists"
        />
        <StatCard
          label="Campaigns"
          value={campaignsQuery.meta?.total}
          isLoading={campaignsQuery.isLoading}
          to="/app/campaigns"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Recent campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentCampaignsQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!recentCampaignsQuery.isLoading && recentCampaignsQuery.rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No campaigns yet.{' '}
                <Link to="/app/campaigns" className="text-primary hover:underline">
                  Create one
                </Link>
                .
              </p>
            )}
            {recentCampaignsQuery.rows.map((c) => (
              <Link
                key={c.id}
                to={`/app/campaigns/${c.id}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.subject}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {c.recipientCount} recipient{c.recipientCount === 1 ? '' : 's'}
                  </span>
                  <Badge variant={STATUS_BADGE_VARIANT[c.status]}>{c.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            {isSubLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isSubLoading && !subscription && (
              <p className="text-sm text-muted-foreground">
                No active subscription.{' '}
                <Link to="/app/billing" className="text-primary hover:underline">
                  Pick a plan
                </Link>
                .
              </p>
            )}
            {subscription && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{subscription.plan?.name ?? 'Unknown plan'}</span>
                  <Badge variant="secondary">{subscription.status}</Badge>
                </div>
                {subscription.currentPeriodEnd && (
                  <p className="text-muted-foreground">
                    {subscription.status === 'trialing' ? 'Trial ends' : 'Renews'}{' '}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
                <Link to="/app/billing" className="text-primary hover:underline">
                  Manage billing
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  isLoading,
  to,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  to: string;
}) {
  return (
    <Link to={to}>
      <Card className="transition-colors hover:bg-accent">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold">
            {isLoading ? '—' : (value?.toLocaleString() ?? 0)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
