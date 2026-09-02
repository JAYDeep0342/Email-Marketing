import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { ContactStatus } from '@/features/contacts/contacts.api';
import { AddContactsDialog } from '@/features/lists/add-contacts-dialog';
import { ListMemberContact } from '@/features/lists/lists.api';
import { useList, useListContacts, useRemoveContactFromList } from '@/features/lists/use-lists';

const STATUS_LABEL: Record<ContactStatus, string> = {
  subscribed: 'Subscribed',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Complained',
};

const STATUS_BADGE_VARIANT: Record<
  ContactStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  subscribed: 'default',
  unsubscribed: 'secondary',
  bounced: 'destructive',
  complained: 'outline',
};

const PAGE_SIZE = 20;

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const listId = id!;
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const { data: list, isLoading: isListLoading } = useList(listId);
  const { rows, meta, isLoading, isFetching, isError, error } = useListContacts(listId, {
    page,
    limit: PAGE_SIZE,
  });
  const removeMutation = useRemoveContactFromList(listId);

  const columns: DataTableColumn<ListMemberContact>[] = [
    { key: 'email', header: 'Email', cell: (c) => c.email },
    {
      key: 'name',
      header: 'Name',
      cell: (c) =>
        [c.firstName, c.lastName].filter(Boolean).join(' ') || (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <Badge variant={STATUS_BADGE_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (c) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeMutation.mutate(c.id)}
            disabled={removeMutation.isPending}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/lists"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to lists
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isListLoading ? 'Loading…' : (list?.name ?? 'List')}
            </h1>
            {list?.description && (
              <p className="mt-1 text-sm text-muted-foreground">{list.description}</p>
            )}
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contacts
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">
            Contacts {meta ? `(${meta.total})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No contacts in this list yet — add some."
            meta={meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <AddContactsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        listId={listId}
        existingContactIds={rows.map((c) => c.id)}
      />
    </div>
  );
}
