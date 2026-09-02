import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { normalizeAxiosError } from '@/lib/api';
import { AutomationDialog } from '@/features/automations/automation-dialog';
import { AutomationRun, AutomationStatus } from '@/features/automations/automations.api';
import { DeleteAutomationDialog } from '@/features/automations/delete-automation-dialog';
import { StepsBuilder } from '@/features/automations/steps-builder';
import {
  useActivateAutomation,
  useAutomation,
  useEnrollContact,
  usePauseAutomation,
  useRuns,
} from '@/features/automations/use-automations';

const STATUS_BADGE_VARIANT: Record<AutomationStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
};

const PAGE_SIZE = 20;

export default function AutomationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const automationId = id!;
  const navigate = useNavigate();

  const { data: automation, isLoading, isError, error } = useAutomation(automationId);
  const [page, setPage] = useState(1);
  const runsQuery = useRuns(automationId, { page, limit: PAGE_SIZE });

  const activateMutation = useActivateAutomation(automationId);
  const pauseMutation = usePauseAutomation(automationId);
  const enrollMutation = useEnrollContact(automationId);
  const [enrollContactId, setEnrollContactId] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !automation) {
    return (
      <p className="text-sm text-destructive">
        {error ? normalizeAxiosError(error).message : 'Automation not found.'}
      </p>
    );
  }

  const runColumns: DataTableColumn<AutomationRun>[] = [
    { key: 'contactId', header: 'Contact', cell: (r) => r.contactId },
    { key: 'status', header: 'Status', cell: (r) => <Badge variant="secondary">{r.status}</Badge> },
    { key: 'startedAt', header: 'Started', cell: (r) => new Date(r.startedAt).toLocaleString() },
    {
      key: 'completedAt',
      header: 'Completed',
      cell: (r) => (r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/automations"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to automations
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{automation.name}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[automation.status]}>{automation.status}</Badge>
            <span className="text-sm text-muted-foreground">
              Trigger: {automation.triggerType}
            </span>
          </div>
          <div className="flex gap-2">
            {automation.status === 'active' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
              >
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending}
              >
                Activate
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <StepsBuilder automationId={automationId} initialSteps={automation.steps} />

      {automation.triggerType === 'manual' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Enroll a contact manually</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Contact ID"
                value={enrollContactId}
                onChange={(e) => setEnrollContactId(e.target.value)}
                className="max-w-sm"
              />
              <Button
                onClick={() => {
                  enrollMutation.mutate(enrollContactId, {
                    onSuccess: () => setEnrollContactId(''),
                  });
                }}
                disabled={!enrollContactId.trim() || enrollMutation.isPending}
              >
                Enroll
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Runs {runsQuery.meta ? `(${runsQuery.meta.total})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={runColumns}
            rows={runsQuery.rows}
            rowKey={(r) => r.id}
            isLoading={runsQuery.isLoading}
            isFetching={runsQuery.isFetching}
            isError={runsQuery.isError}
            errorMessage={
              runsQuery.error ? normalizeAxiosError(runsQuery.error).message : undefined
            }
            emptyMessage="No runs yet."
            meta={runsQuery.meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <AutomationDialog open={editOpen} onOpenChange={setEditOpen} automation={automation} />

      <DeleteAutomationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        automation={automation}
        onDeleted={() => navigate('/app/automations')}
      />
    </div>
  );
}
