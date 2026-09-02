import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  addContactTag,
  Contact,
  createContact,
  createTag,
  deleteContact,
  fetchContacts,
  fetchTags,
  ListContactsParams,
  removeContactTag,
  updateContact,
} from './contacts.api';

const CONTACTS_LIST_KEY = 'contacts-list' as const;

export function useContactsList(params: ListContactsParams) {
  return usePaginatedQuery<Contact>([CONTACTS_LIST_KEY, params], () =>
    fetchContacts(params),
  );
}

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: fetchTags });
}

function useInvalidateContacts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [CONTACTS_LIST_KEY] });
}

// Exposed for the contact dialog: tag add/remove don't invalidate on every
// call (see below), so the page calls this once when the dialog closes to
// pick up any tag changes in the table's Tags column.
export const useRefreshContactsList = useInvalidateContacts;

export function useCreateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: createContact,
    onSuccess: () => {
      invalidate();
      toast.success('Contact added');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateContact>[1]) =>
      updateContact(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Contact updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeleteContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: deleteContact,
    onSuccess: () => {
      invalidate();
      toast.success('Contact deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

// Tag mutations deliberately do NOT invalidate the list on every call — the
// contact dialog updates its own local tag badges optimistically (see
// contact-dialog.tsx) so the table doesn't need to refetch until it closes.
export function useAddContactTag() {
  return useMutation({
    mutationFn: ({ contactId, tagId }: { contactId: string; tagId: string }) =>
      addContactTag(contactId, tagId),
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useRemoveContactTag() {
  return useMutation({
    mutationFn: ({ contactId, tagId }: { contactId: string; tagId: string }) =>
      removeContactTag(contactId, tagId),
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createTag(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}
