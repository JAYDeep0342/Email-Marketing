import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { api, apiCall } from '@/lib/api';
import { useAdminPlansList } from '@/features/admin-plans/use-admin-plans';

/**
 * Platform dashboard overview. Every number here comes from an endpoint
 * that already exists and is platform-admin-guarded — GET /admin/plans and
 * GET /sending-servers. There's no "list all tenants" endpoint (checked:
 * TenantsController only exposes /tenants/current, scoped to the caller's
 * own tenant), so a tenant/customer count isn't shown here — that needs a
 * new backend endpoint, flagged rather than invented.
 */
export default function AdminDashboardPage() {
  const plansQuery = useAdminPlansList();
  const serversQuery = useQuery({
    queryKey: ['admin-sending-servers-count'],
    queryFn: () => apiCall<unknown[]>(() => api.get('/sending-servers')),
  });

  const plans = plansQuery.data ?? [];
  const activePlans = plans.filter((p) => p.isActive).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Platform Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/admin/plans">
          <Card className="transition-colors hover:bg-accent">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Plans</p>
              <p className="text-3xl font-bold">
                {plansQuery.isLoading ? '—' : plans.length}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Active Plans</p>
            <p className="text-3xl font-bold">
              {plansQuery.isLoading ? '—' : activePlans}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Sending Servers</p>
            <p className="text-3xl font-bold">
              {serversQuery.isLoading ? '—' : (serversQuery.data?.length ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Customer/tenant counts aren't shown here — there's no backend endpoint to list
          all tenants across the platform yet (only <code>GET /tenants/current</code>,
          scoped to one tenant). That's a real gap for a future "Customers" screen, not
          something faked here.
        </CardContent>
      </Card>
    </div>
  );
}
