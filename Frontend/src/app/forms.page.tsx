import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { DeleteFormDialog } from '@/features/forms/delete-form-dialog';
import { FormDialog } from '@/features/forms/form-dialog';
import { FormSummary } from '@/features/forms/forms.api';
import { useFormsList } from '@/features/forms/use-forms';

const PAGE_SIZE = 20;

export default function FormsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { rows, meta, isLoading, isFetching, isError, error } = useFormsList({
    page,
    limit: PAGE_SIZE,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<FormSummary | null>(null);
  const [deletingForm, setDeletingForm] = useState<FormSummary | null>(null);

  const columns: DataTableColumn<FormSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (f) => (
        <button
          type="button"
          onClick={() => navigate(`/app/forms/${f.id}`)}
          className="cursor-pointer font-medium text-primary hover:underline"
        >
          {f.name}
        </button>
      ),
    },
    { key: 'type', header: 'Type', cell: (f) => <Badge variant="secondary">{f.type}</Badge> },
    {
      key: 'status',
      header: 'Status',
      cell: (f) => <Badge variant={f.isActive ? 'default' : 'outline'}>{f.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    { key: 'submissions', header: 'Submissions', cell: (f) => f.submissionCount },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (f) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditingForm(f)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeletingForm(f)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Forms</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Form
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">All forms</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(f) => f.id}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No forms yet — create your first one."
            meta={meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <FormDialog
        key="create"
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => navigate(`/app/forms/${id}`)}
      />

      <FormDialog
        key={editingForm?.id ?? 'edit-empty'}
        open={!!editingForm}
        onOpenChange={(open) => !open && setEditingForm(null)}
        form={editingForm}
      />

      <DeleteFormDialog
        open={!!deletingForm}
        onOpenChange={(open) => !open && setDeletingForm(null)}
        form={deletingForm}
      />
    </div>
  );
}
