import { api, apiCall } from '@/lib/api';
import type { PaginatedEnvelope } from '@/types/api';

/**
 * Contacts API — hand-mirrored against server/src/modules/contacts.
 *
 * Note: GET /contacts (list) does NOT include `tags` by default in the
 * backend — only GET /contacts/:id (findOne) did. The list query was
 * extended (contacts.service.ts) to include contactTags so the table can
 * show a Tags column without an extra request per row; keep this type in
 * sync if that changes.
 */

export const CONTACT_STATUSES = [
  'subscribed',
  'unsubscribed',
  'bounced',
  'complained',
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface ContactTag {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatus;
  attributes: Record<string, unknown>;
  createdAt: string;
  tags: ContactTag[];
}

export interface ListContactsParams {
  page: number;
  limit: number;
  search?: string;
  status?: ContactStatus;
}

export function fetchContacts(params: ListContactsParams) {
  return api.get<PaginatedEnvelope<Contact>>('/contacts', { params });
}

export interface CreateContactPayload {
  email: string;
  firstName?: string;
  lastName?: string;
  status?: ContactStatus;
}

export function createContact(payload: CreateContactPayload) {
  return apiCall<Contact>(() => api.post('/contacts', payload));
}

export interface UpdateContactPayload {
  firstName?: string;
  lastName?: string;
  status?: ContactStatus;
}

export function updateContact(id: string, payload: UpdateContactPayload) {
  return apiCall<Contact>(() => api.patch(`/contacts/${id}`, payload));
}

export function deleteContact(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/contacts/${id}`));
}

export function addContactTag(contactId: string, tagId: string) {
  return apiCall<{ message: string }>(() =>
    api.post(`/contacts/${contactId}/tags`, { tagId }),
  );
}

export function removeContactTag(contactId: string, tagId: string) {
  return apiCall<{ message: string }>(() =>
    api.delete(`/contacts/${contactId}/tags/${tagId}`),
  );
}

// ---- Tags (shared across the tenant, not contact-scoped) ----

export function fetchTags() {
  return apiCall<ContactTag[]>(() => api.get('/tags'));
}

export function createTag(name: string) {
  return apiCall<ContactTag>(() => api.post('/tags', { name }));
}
