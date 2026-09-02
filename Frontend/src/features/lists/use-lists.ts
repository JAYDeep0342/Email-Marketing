import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  addContactsToList,
  createList,
  deleteList,
  fetchList,
  fetchLists,
  fetchListContacts,
  ListMemberContact,
  ListSummary,
  PageParams,
  removeContactFromList,
  updateList,
} from './lists.api';

const LISTS_KEY = 'lists-list' as const;
const LIST_CONTACTS_KEY = 'list-contacts' as const;

export function useListsList(params: PageParams) {
  return usePaginatedQuery<ListSummary>([LISTS_KEY, params], () => fetchLists(params));
}

export function useList(id: string) {
  return useQuery({
    queryKey: [LISTS_KEY, 'detail', id],
    queryFn: () => fetchList(id),
    enabled: !!id,
  });
}

function useInvalidateLists() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [LISTS_KEY] });
}

export function useCreateList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: createList,
    onSuccess: () => {
      invalidate();
      toast.success('List created');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdateList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateList>[1]) =>
      updateList(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('List updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeleteList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: deleteList,
    onSuccess: () => {
      invalidate();
      toast.success('List deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

// ---- List membership (contacts inside one list) ----

export function useListContacts(listId: string, params: PageParams) {
  return usePaginatedQuery<ListMemberContact>([LIST_CONTACTS_KEY, listId, params], () =>
    fetchListContacts(listId, params),
  );
}

function useInvalidateListContacts(listId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [LIST_CONTACTS_KEY, listId] });
    // contactCount on the lists table changes too
    qc.invalidateQueries({ queryKey: [LISTS_KEY] });
  };
}

export function useAddContactsToList(listId: string) {
  const invalidate = useInvalidateListContacts(listId);
  return useMutation({
    mutationFn: (contactIds: string[]) => addContactsToList(listId, contactIds),
    onSuccess: ({ added, skipped }) => {
      invalidate();
      toast.success(
        skipped > 0 ? `${added} added, ${skipped} already in list` : `${added} contact(s) added`,
      );
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useRemoveContactFromList(listId: string) {
  const invalidate = useInvalidateListContacts(listId);
  return useMutation({
    mutationFn: (contactId: string) => removeContactFromList(listId, contactId),
    onSuccess: () => {
      invalidate();
      toast.success('Contact removed from list');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}
