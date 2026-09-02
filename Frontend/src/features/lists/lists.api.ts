import { api, apiCall } from '@/lib/api';
import type { PaginatedEnvelope } from '@/types/api';
import type { ContactStatus } from '@/features/contacts/contacts.api';

/**
 * Lists API — hand-mirrored against server/src/modules/lists.
 *
 * Note: GET /lists was plain-array (ApiEnvelope<List[]>, no pagination) —
 * extended to accept page/limit and return the {success,data,meta} envelope
 * (same paginated() helper GET /contacts and GET /lists/:id/contacts already
 * used) so this screen can reuse DataTable/usePaginatedQuery exactly like
 * Contacts. See lists.service.ts.
 */

export interface ListSummary {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  createdAt: string;
}

export interface PageParams {
  page: number;
  limit: number;
}

export function fetchLists(params: PageParams) {
  return api.get<PaginatedEnvelope<ListSummary>>('/lists', { params });
}

export function fetchList(id: string) {
  return apiCall<ListSummary>(() => api.get(`/lists/${id}`));
}

export interface CreateListPayload {
  name: string;
  description?: string;
}

export function createList(payload: CreateListPayload) {
  return apiCall<ListSummary>(() => api.post('/lists', payload));
}

export interface UpdateListPayload {
  name?: string;
  description?: string;
}

export function updateList(id: string, payload: UpdateListPayload) {
  return apiCall<ListSummary>(() => api.patch(`/lists/${id}`, payload));
}

export function deleteList(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/lists/${id}`));
}

// ---- Membership (contacts inside one list) ----

// The shape GET /lists/:id/contacts actually returns — raw Contact rows
// (ListsService.listContacts maps ListContact -> its .contact), no `tags`
// include unlike GET /contacts. Keep this narrower type in sync if that
// endpoint changes.
export interface ListMemberContact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatus;
  createdAt: string;
}

export function fetchListContacts(listId: string, params: PageParams) {
  return api.get<PaginatedEnvelope<ListMemberContact>>(`/lists/${listId}/contacts`, {
    params,
  });
}

export function addContactsToList(listId: string, contactIds: string[]) {
  return apiCall<{ added: number; skipped: number }>(() =>
    api.post(`/lists/${listId}/contacts`, { contactIds }),
  );
}

export function removeContactFromList(listId: string, contactId: string) {
  return apiCall<{ message: string }>(() =>
    api.delete(`/lists/${listId}/contacts/${contactId}`),
  );
}
