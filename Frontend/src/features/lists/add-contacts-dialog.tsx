import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useContactsList } from '@/features/contacts/use-contacts';
import { useAddContactsToList } from './use-lists';

interface AddContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  /** Contact ids already in the list (the currently-loaded page) — used to
   * hide them from the "add" search so you don't re-add the same contact.
   * Best-effort only; the backend's addContacts skipDuplicates handles the
   * rest safely if a match outside this page slips through. */
  existingContactIds: string[];
}

const PAGE_SIZE = 10;

export function AddContactsDialog({
  open,
  onOpenChange,
  listId,
  existingContactIds,
}: AddContactsDialogProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset the search box each time the dialog re-opens.
  useEffect(() => {
    if (open) {
      setSearchInput('');
      setSearch('');
    }
  }, [open]);

  const { rows, isLoading } = useContactsList({
    page: 1,
    limit: PAGE_SIZE,
    search: search || undefined,
  });
  const candidates = rows.filter((c) => !existingContactIds.includes(c.id));

  const addMutation = useAddContactsToList(listId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contacts to list</DialogTitle>
          <DialogDescription>
            Search your contacts and add them to this list.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search by email or name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          autoFocus
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading && (
            <p className="py-4 text-center text-sm text-muted-foreground">Searching…</p>
          )}
          {!isLoading && candidates.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {search ? 'No matching contacts.' : 'Start typing to search contacts.'}
            </p>
          )}
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.email}</p>
                {(c.firstName || c.lastName) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addMutation.mutate([c.id])}
                disabled={addMutation.isPending}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
