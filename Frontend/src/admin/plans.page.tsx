import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { AdminCurrency, AdminPlan } from '@/features/admin-plans/admin-plans.api';
import { DeletePlanDialog } from '@/features/admin-plans/delete-plan-dialog';
import { PlanDialog } from '@/features/admin-plans/plan-dialog';
import { useAdminPlansList, useTogglePlanActive } from '@/features/admin-plans/use-admin-plans';

function formatPrice(priceCents: number, currency: AdminCurrency | null) {
  return `${currency?.symbol ?? ''}${(priceCents / 100).toFixed(2)}`;
}

function formatLimit(n: number | null | undefined) {
  return n === null || n === undefined ? 'Unlimited' : n.toLocaleString();
}

export default function AdminPlansPage() {
  const { data: plans, isLoading, isError, error } = useAdminPlansList();
  const toggleMutation = useTogglePlanActive();

  const [addOpen, setAddOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<AdminPlan | null>(null);

  // No GET /currencies endpoint — derive the picker's options from whatever
  // currencies already show up on the loaded plans (see admin-plans.api.ts).
  const currencies = useMemo(() => {
    const byId = new Map<string, AdminCurrency>();
    for (const p of plans ?? []) {
      if (p.currency) byId.set(p.currency.id, p.currency);
    }
    return [...byId.values()];
  }, [plans]);

  const columns: DataTableColumn<AdminPlan>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (p) => (
        <button
          type="button"
          onClick={() => setEditingPlan(p)}
          className="cursor-pointer font-medium text-primary hover:underline"
        >
          {p.name}
        </button>
      ),
    },
    { key: 'code', header: 'Code', cell: (p) => <code className="text-xs">{p.code}</code> },
    {
      key: 'price',
      header: 'Price',
      cell: (p) => `${formatPrice(p.priceCents, p.currency)} / ${p.billingPeriod === 'yearly' ? 'yr' : 'mo'}`,
    },
    {
      key: 'limits',
      header: 'Limits',
      cell: (p) => (
        <div className="text-xs text-muted-foreground">
          <div>{formatLimit(p.planLimit?.maxContacts)} contacts</div>
          <div>{formatLimit(p.planLimit?.maxEmailsMonth)} emails/mo</div>
        </div>
      ),
    },
    {
      key: 'features',
      header: 'Features',
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.planLimit?.aiEnabled && <Badge variant="secondary">AI</Badge>}
          {p.planLimit?.dedicatedIp && <Badge variant="secondary">Dedicated IP</Badge>}
          {!p.planLimit?.aiEnabled && !p.planLimit?.dedicatedIp && (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <button
          type="button"
          onClick={() => toggleMutation.mutate({ id: p.id, isActive: !p.isActive })}
          disabled={toggleMutation.isPending}
        >
          <Badge variant={p.isActive ? 'default' : 'outline'} className="cursor-pointer">
            {p.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditingPlan(p)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeletingPlan(p)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Plan
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">
            All plans {plans ? `(${plans.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={plans ?? []}
            rowKey={(p) => p.id}
            isLoading={isLoading}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No plans yet — create your first one."
          />
        </CardContent>
      </Card>

      <PlanDialog key="create" open={addOpen} onOpenChange={setAddOpen} currencies={currencies} />

      <PlanDialog
        key={editingPlan?.id ?? 'edit-empty'}
        open={!!editingPlan}
        onOpenChange={(open) => !open && setEditingPlan(null)}
        plan={editingPlan}
        currencies={currencies}
      />

      <DeletePlanDialog
        open={!!deletingPlan}
        onOpenChange={(open) => !open && setDeletingPlan(null)}
        plan={deletingPlan}
      />
    </div>
  );
}
