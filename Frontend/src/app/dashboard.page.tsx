import { useState } from 'react';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  FolderPlus,
  MailOpen,
  MousePointerClick,
  Send,
  Upload,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useContactsList } from '@/features/contacts/use-contacts';
import { ContactStatus } from '@/features/contacts/contacts.api';
import { useListsList } from '@/features/lists/use-lists';
import { useCampaignsList } from '@/features/campaigns/use-campaigns';
import { CampaignStatus } from '@/features/campaigns/campaigns.api';
import { useSubscription } from '@/features/billing/use-subscription';
import { DASHBOARD_RANGE_DAYS, DashboardRangeDays } from '@/features/dashboard/dashboard.api';
import {
  useDashboardActivity,
  useDashboardOverview,
  useTopCampaigns,
} from '@/features/dashboard/use-dashboard';

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

const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  subscribed: 'Subscribed',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Complained',
};

// Only 4 semantic color tokens exist in this design system (primary/
// secondary/accent/destructive — checked index.css), so the 4 donut
// segments are built from opacity variants of the two that read as
// "good"/"bad" rather than introducing new colors.
const CONTACT_STATUS_COLOR: Record<ContactStatus, string> = {
  subscribed: 'hsl(var(--primary))',
  unsubscribed: 'hsl(var(--muted-foreground))',
  bounced: 'hsl(var(--destructive))',
  complained: 'hsl(var(--destructive) / 0.55)',
};

const RECENT_CAMPAIGNS_LIMIT = 8;

/**
 * Dashboard overview (Acelle-style). Pass 1 covered quota/quick-actions/
 * recent-campaigns/subscriber-donut from screens' own existing endpoints.
 * Pass 2 adds the account-wide aggregates (7-day metrics, sending activity
 * time series, top campaigns by open rate) from the new GET /dashboard/*
 * endpoints built for exactly this.
 */
export default function DashboardPage() {
  const { user } = useAuthStore();

  const listsQuery = useListsList({ page: 1, limit: 1 });
  const campaignsCountQuery = useCampaignsList({ page: 1, limit: 1 });
  const contactsCountQuery = useContactsList({ page: 1, limit: 1 });
  const { data: subscription } = useSubscription();

  const recentCampaignsQuery = useCampaignsList({ page: 1, limit: RECENT_CAMPAIGNS_LIMIT });

  const [activityRange, setActivityRange] = useState<DashboardRangeDays>(7);
  const overviewQuery = useDashboardOverview(7); // metric cards are fixed "last 7 days"
  const activityQuery = useDashboardActivity(activityRange);
  const topCampaignsQuery = useTopCampaigns(5);

  const limit = subscription?.plan?.planLimit;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        Welcome{user?.firstName ? `, ${user.firstName}` : ''}
      </h1>

      {/* ---- 1. Quota usage ---- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuotaCard
          label="Lists"
          count={listsQuery.meta?.total}
          max={limit?.maxLists ?? null}
          isLoading={listsQuery.isLoading}
          to="/app/lists"
        />
        <QuotaCard
          label="Campaigns"
          count={campaignsCountQuery.meta?.total}
          max={limit?.maxCampaigns ?? null}
          isLoading={campaignsCountQuery.isLoading}
          to="/app/campaigns"
        />
        <QuotaCard
          label="Subscribers"
          count={contactsCountQuery.meta?.total}
          max={limit?.maxContacts ?? null}
          isLoading={contactsCountQuery.isLoading}
          to="/app/contacts"
        />
      </div>

      {/* ---- 2. Quick actions ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard
          to="/app/campaigns"
          icon={Send}
          title="New Campaign"
          description="Draft and send a campaign"
        />
        <QuickActionCard
          to="/app/contacts"
          icon={Upload}
          title="Import Contacts"
          description="Add subscribers to your list"
        />
        <QuickActionCard
          to="/app/lists"
          icon={FolderPlus}
          title="Create List"
          description="Organize your subscribers"
        />
        <QuickActionCard
          to="/app/campaigns"
          icon={BarChart3}
          title="View Reports"
          description="Check campaign performance"
        />
      </div>

      {/* ---- 3. 7-day metric cards ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Send}
          label="Total Sent"
          value={overviewQuery.data?.totals.totalSent}
          isLoading={overviewQuery.isLoading}
        />
        <MetricCard
          icon={MailOpen}
          label="Open Rate"
          value={overviewQuery.data?.rates.openRate}
          suffix="%"
          isLoading={overviewQuery.isLoading}
        />
        <MetricCard
          icon={MousePointerClick}
          label="Click Rate"
          value={overviewQuery.data?.rates.clickRate}
          suffix="%"
          isLoading={overviewQuery.isLoading}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Bounce Rate"
          value={overviewQuery.data?.rates.bounceRate}
          suffix="%"
          isLoading={overviewQuery.isLoading}
        />
      </div>

      {/* ---- 4. Sending activity chart ---- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base font-medium">Sending activity</CardTitle>
          <Tabs
            value={String(activityRange)}
            onValueChange={(v) => setActivityRange(Number(v) as DashboardRangeDays)}
          >
            <TabsList>
              {DASHBOARD_RANGE_DAYS.map((d) => (
                <TabsTrigger key={d} value={String(d)}>
                  {d}d
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {activityQuery.isLoading && <div className="h-64 animate-pulse rounded-md bg-muted" />}
          {!activityQuery.isLoading && activityQuery.data && (
            <div className="relative h-64">
              {activityQuery.data.every((p) => p.count === 0) && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  No sends recorded in this period yet.
                </p>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityQuery.data} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="sendingActivityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) =>
                      new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    }
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    interval={activityRange === 7 ? 0 : 'preserveStartEnd'}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    labelFormatter={((d: string) => new Date(d).toLocaleDateString()) as never}
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#sendingActivityFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---- 5. Recent campaigns ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Recent campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentCampaignsQuery.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
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
                  <p className="truncate text-xs text-muted-foreground">
                    {formatRelativeTime(c.sentAt ?? c.scheduledAt ?? c.createdAt)}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE_VARIANT[c.status]} className="shrink-0">
                  {c.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* ---- 6. Top campaigns by open rate ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Top campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topCampaignsQuery.isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            {!topCampaignsQuery.isLoading && (topCampaignsQuery.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No sent campaigns yet.</p>
            )}
            {(topCampaignsQuery.data ?? []).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-4 shrink-0 text-sm font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to={`/app/campaigns/${c.id}`}
                      className="cursor-pointer truncate text-sm font-medium text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
                      {c.openRate}%
                    </span>
                  </div>
                  <Progress value={c.openRate} max={100} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ---- 7. Subscriber status donut ---- */}
        <SubscriberStatusCard />
      </div>
    </div>
  );
}

// ============================================================
//  3. 7-day metric card
// ============================================================
function MetricCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  suffix?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <p className="text-2xl font-bold">
          {isLoading ? '—' : `${(value ?? 0).toLocaleString()}${suffix}`}
        </p>
        <p className="text-xs text-muted-foreground">Last 7 days</p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  1. Quota usage card
// ============================================================
function QuotaCard({
  label,
  count,
  max,
  isLoading,
  to,
}: {
  label: string;
  count: number | undefined;
  max: number | null;
  isLoading: boolean;
  to: string;
}) {
  const pct = max && count !== undefined ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const isNearLimit = pct >= 90;

  return (
    <Link to={to}>
      <Card className="transition-colors hover:bg-accent">
        <CardContent className="space-y-2 pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{label}</p>
            {max === null && !isLoading && <Badge variant="outline">Unlimited</Badge>}
          </div>
          <p className="text-2xl font-bold">
            {isLoading ? '—' : (count?.toLocaleString() ?? 0)}
            {max !== null && !isLoading && (
              <span className="text-base font-normal text-muted-foreground"> / {max.toLocaleString()}</span>
            )}
          </p>
          {max !== null && !isLoading && (
            <>
              <Progress
                value={count ?? 0}
                max={max}
                indicatorClassName={cn(isNearLimit && 'bg-destructive')}
              />
              <p className="text-xs text-muted-foreground">{pct}% of max</p>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ============================================================
//  2. Quick action card
// ============================================================
function QuickActionCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link to={to}>
      <Card className="h-full transition-colors hover:bg-accent">
        <CardContent className="flex items-start gap-3 pt-6">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ============================================================
//  4. Subscriber status donut
// ============================================================
function SubscriberStatusCard() {
  // One call per real status (CONTACT_STATUSES has exactly these 4) — called
  // explicitly rather than via .map() so it's an ordinary, fixed set of hook
  // calls like everywhere else in this codebase.
  const subscribedQuery = useContactsList({ page: 1, limit: 1, status: 'subscribed' });
  const unsubscribedQuery = useContactsList({ page: 1, limit: 1, status: 'unsubscribed' });
  const bouncedQuery = useContactsList({ page: 1, limit: 1, status: 'bounced' });
  const complainedQuery = useContactsList({ page: 1, limit: 1, status: 'complained' });

  const isLoading = [subscribedQuery, unsubscribedQuery, bouncedQuery, complainedQuery].some(
    (q) => q.isLoading,
  );
  const counts: { status: ContactStatus; count: number }[] = [
    { status: 'subscribed', count: subscribedQuery.meta?.total ?? 0 },
    { status: 'unsubscribed', count: unsubscribedQuery.meta?.total ?? 0 },
    { status: 'bounced', count: bouncedQuery.meta?.total ?? 0 },
    { status: 'complained', count: complainedQuery.meta?.total ?? 0 },
  ];
  const total = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Subscriber status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-48 animate-pulse rounded-md bg-muted" />}
        {!isLoading && total === 0 && (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        )}
        {!isLoading && total > 0 && (
          <div className="space-y-4">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={counts}
                    dataKey="count"
                    nameKey="status"
                    innerRadius="60%"
                    outerRadius="90%"
                    paddingAngle={counts.filter((c) => c.count > 0).length > 1 ? 2 : 0}
                    stroke="none"
                  >
                    {counts.map((c) => (
                      <Cell key={c.status} fill={CONTACT_STATUS_COLOR[c.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    // recharts' Formatter typing doesn't line up cleanly with a
                    // Pie's per-slice payload — cast is contained to this one prop.
                    formatter={
                      ((value: number, _name: unknown, entry: { payload: { status: ContactStatus } }) => [
                        value,
                        CONTACT_STATUS_LABEL[entry.payload.status],
                      ]) as never
                    }
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5 text-sm">
              {counts.map((c) => (
                <li key={c.status} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CONTACT_STATUS_COLOR[c.status] }}
                    />
                    <span className="truncate">{CONTACT_STATUS_LABEL[c.status]}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                    {c.count.toLocaleString()} ({total > 0 ? Math.round((c.count / total) * 100) : 0}%)
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 border-t border-border pt-1.5 font-medium">
                <span className="truncate">Total</span>
                <span className="shrink-0 whitespace-nowrap">{total.toLocaleString()}</span>
              </li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
