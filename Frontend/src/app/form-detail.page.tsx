import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { DeleteFormDialog } from '@/features/forms/delete-form-dialog';
import { FormDialog } from '@/features/forms/form-dialog';
import { FormSubmission } from '@/features/forms/forms.api';
import { useForm, useSubmissions } from '@/features/forms/use-forms';

const PAGE_SIZE = 20;

export default function FormDetailPage() {
  const { id } = useParams<{ id: string }>();
  const formId = id!;
  const navigate = useNavigate();

  const { data: form, isLoading, isError, error } = useForm(formId);
  const [page, setPage] = useState(1);
  const submissionsQuery = useSubmissions(formId, { page, limit: PAGE_SIZE });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !form) {
    return (
      <p className="text-sm text-destructive">
        {error ? normalizeAxiosError(error).message : 'Form not found.'}
      </p>
    );
  }

  const submitUrl = `${window.location.origin}/api/public/forms/${form.id}/submissions`;
  const exampleBody = {
    email: 'visitor@example.com',
    firstName: 'Jane',
    ...(form.fields.length
      ? { data: Object.fromEntries(form.fields.map((f) => [f.name, ''])) }
      : {}),
  };

  const submissionColumns: DataTableColumn<FormSubmission>[] = [
    {
      key: 'contact',
      header: 'Contact',
      cell: (s) => s.contact?.email ?? '— unlinked —',
    },
    {
      key: 'data',
      header: 'Extra data',
      cell: (s) =>
        Object.keys(s.data ?? {}).length ? (
          <code className="text-xs">{JSON.stringify(s.data)}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      cell: (s) => new Date(s.createdAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/forms"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to forms
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{form.name}</h1>
            <Badge variant="secondary">{form.type}</Badge>
            <Badge variant={form.isActive ? 'default' : 'outline'}>
              {form.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Public embed / submission info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-muted-foreground">POST endpoint (no auth required):</p>
            <code className="block overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs">
              POST {submitUrl}
            </code>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">Example request body:</p>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs">
              {JSON.stringify(exampleBody, null, 2)}
            </pre>
          </div>
          {form.listId && (
            <p className="text-xs text-muted-foreground">
              Submissions are automatically added to the linked list.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Submissions {submissionsQuery.meta ? `(${submissionsQuery.meta.total})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={submissionColumns}
            rows={submissionsQuery.rows}
            rowKey={(s) => s.id}
            isLoading={submissionsQuery.isLoading}
            isFetching={submissionsQuery.isFetching}
            isError={submissionsQuery.isError}
            errorMessage={
              submissionsQuery.error
                ? normalizeAxiosError(submissionsQuery.error).message
                : undefined
            }
            emptyMessage="No submissions yet."
            meta={submissionsQuery.meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <FormDialog open={editOpen} onOpenChange={setEditOpen} form={form} />

      <DeleteFormDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        form={form}
        onDeleted={() => navigate('/app/forms')}
      />
    </div>
  );
}
