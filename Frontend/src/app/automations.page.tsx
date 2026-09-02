import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { AutomationDialog } from '@/features/automations/automation-dialog';
import { Automation, AutomationStatus } from '@/features/automations/automations.api';
import { DeleteAutomationDialog } from '@/features/automations/delete-automation-dialog';
import {
  useActivateAutomation,
  useAutomationsList,
  usePauseAutomation,
} from '@/features/automations/use-automations';

const STATUS_BADGE_VARIANT: Record<AutomationStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
};

const PAGE_SIZE = 20;

export default function AutomationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { rows, meta, isLoading, isFetching, isError, error } = useAutomationsList({
    page,
    limit: PAGE_SIZE,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [deletingAutomation, setDeletingAutomation] = useState<Automation | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Automation
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">All automations</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={buildColumns(navigate, setDeletingAutomation)}
            rows={rows}
            rowKey={(a) => a.id}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No automations yet — create your first one."
            meta={meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <AutomationDialog
        key="create"
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => navigate(`/app/automations/${id}`)}
      />

      <DeleteAutomationDialog
        open={!!deletingAutomation}
        onOpenChange={(open) => !open && setDeletingAutomation(null)}
        automation={deletingAutomation}
      />
    </div>
  );
}

function buildColumns(
  navigate: (path: string) => void,
  setDeletingAutomation: (a: Automation) => void,
): DataTableColumn<Automation>[] {
  return [
    {
      key: 'name',
      header: 'Name',
      cell: (a) => (
        <button
          type="button"
          onClick={() => navigate(`/app/automations/${a.id}`)}
          className="cursor-pointer font-medium text-primary hover:underline"
        >
          {a.name}
        </button>
      ),
    },
    { key: 'trigger', header: 'Trigger', cell: (a) => a.triggerType },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => <Badge variant={STATUS_BADGE_VARIANT[a.status]}>{a.status}</Badge>,
    },
    { key: 'steps', header: 'Steps', cell: (a) => a.steps.length },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (a) => <RowActions automation={a} onDelete={() => setDeletingAutomation(a)} />,
    },
  ];
}

function RowActions({ automation, onDelete }: { automation: Automation; onDelete: () => void }) {
  const activateMutation = useActivateAutomation(automation.id);
  const pauseMutation = usePauseAutomation(automation.id);

  return (
    <div className="flex justify-end gap-2">
      {automation.status === 'active' ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => pauseMutation.mutate()}
          disabled={pauseMutation.isPending}
        >
          Pause
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => activateMutation.mutate()}
          disabled={activateMutation.isPending}
        >
          Activate
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
