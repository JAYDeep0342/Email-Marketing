import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { ListSummary } from '@/features/lists/lists.api';
import { ListDialog } from '@/features/lists/list-dialog';
import { DeleteListDialog } from '@/features/lists/delete-list-dialog';
import { useListsList } from '@/features/lists/use-lists';

const PAGE_SIZE = 20;

export default function ListsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { rows, meta, isLoading, isFetching, isError, error } = useListsList({ page, limit: PAGE_SIZE });

  const [addOpen, setAddOpen] = useState(false);
  const [editingList, setEditingList] = useState<ListSummary | null>(null);
  const [deletingList, setDeletingList] = useState<ListSummary | null>(null);

  const columns: DataTableColumn<ListSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (l) => (
        <button
          type="button"
          onClick={() => navigate(`/app/lists/${l.id}`)}
          className="cursor-pointer font-medium text-primary hover:underline"
        >
          {l.name}
        </button>
      ),
    },
    {
      key: 'contactCount',
      header: 'Contacts',
      cell: (l) => l.contactCount,
    },
    {
      key: 'createdAt',
      header: 'Created',
      cell: (l) => new Date(l.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (l) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditingList(l)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeletingList(l)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Lists</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create List
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">All lists</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(l) => l.id}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No lists yet — create your first one."
            meta={meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <ListDialog key="create" open={addOpen} onOpenChange={setAddOpen} />

      <ListDialog
        key={editingList?.id ?? 'edit-empty'}
        open={!!editingList}
        onOpenChange={(open) => !open && setEditingList(null)}
        list={editingList}
      />

      <DeleteListDialog
        open={!!deletingList}
        onOpenChange={(open) => !open && setDeletingList(null)}
        list={deletingList}
      />
    </div>
  );
}
