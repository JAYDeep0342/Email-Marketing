import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { normalizeAxiosError } from '@/lib/api';
import {
  CONTACT_STATUSES,
  Contact,
  ContactStatus,
} from '@/features/contacts/contacts.api';
import { ContactDialog } from '@/features/contacts/contact-dialog';
import { DeleteContactDialog } from '@/features/contacts/delete-contact-dialog';
import { useContactsList, useRefreshContactsList } from '@/features/contacts/use-contacts';

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

export default function ContactsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContactStatus | 'all'>('all');

  // Simple 350ms debounce — no need to pull in a library for one field.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { rows, meta, isLoading, isFetching, isError, error } = useContactsList({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status === 'all' ? undefined : status,
  });

  const refreshList = useRefreshContactsList();

  const [addOpen, setAddOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);

  const columns: DataTableColumn<Contact>[] = [
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
      key: 'tags',
      header: 'Tags',
      cell: (c) =>
        c.tags.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {c.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.name}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (c) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditingContact(c)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeletingContact(c)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">All contacts</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-64 pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as ContactStatus | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CONTACT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            emptyMessage={
              search || status !== 'all'
                ? 'No contacts match your search.'
                : 'No contacts yet — add your first one.'
            }
            meta={meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <ContactDialog key="create" open={addOpen} onOpenChange={setAddOpen} />

      <ContactDialog
        key={editingContact?.id ?? 'edit-empty'}
        open={!!editingContact}
        onOpenChange={(open) => {
          if (!open) {
            setEditingContact(null);
            refreshList();
          }
        }}
        contact={editingContact}
      />

      <DeleteContactDialog
        open={!!deletingContact}
        onOpenChange={(open) => !open && setDeletingContact(null)}
        contact={deletingContact}
      />
    </div>
  );
}
