import { api, apiCall } from '@/lib/api';
import type { PaginatedEnvelope } from '@/types/api';

/**
 * Forms API — hand-mirrored against server/src/modules/forms.
 *
 * `fields` is opaque JSON on the backend (any[]) — the public submit
 * endpoint doesn't validate against it, it's purely descriptive for the
 * admin UI / a future public embed renderer. We model it here as a simple
 * {name,label,required} list, which is enough for "define what this form
 * captures" without inventing a full form-builder.
 */

export const FORM_TYPES = ['embedded', 'popup', 'hosted'] as const;
export type FormType = (typeof FORM_TYPES)[number];

export interface FormFieldDef {
  name: string;
  label: string;
  required?: boolean;
}

export interface FormSummary {
  id: string;
  name: string;
  type: FormType;
  listId: string | null;
  fields: FormFieldDef[];
  settings: Record<string, any>;
  isActive: boolean;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageParams {
  page: number;
  limit: number;
}

export function fetchForms(params: PageParams) {
  return api.get<PaginatedEnvelope<FormSummary>>('/forms', { params });
}

export function fetchForm(id: string) {
  return apiCall<FormSummary>(() => api.get(`/forms/${id}`));
}

export interface FormPayload {
  name: string;
  type?: FormType;
  listId?: string | null;
  fields?: FormFieldDef[];
  isActive?: boolean;
}

export function createForm(payload: FormPayload) {
  return apiCall<FormSummary>(() => api.post('/forms', payload));
}

export function updateForm(id: string, payload: Partial<FormPayload>) {
  return apiCall<FormSummary>(() => api.patch(`/forms/${id}`, payload));
}

export function deleteForm(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/forms/${id}`));
}

export interface FormSubmissionContact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  contactId: string | null;
  data: Record<string, any>;
  ipAddress: string | null;
  createdAt: string;
  contact: FormSubmissionContact | null;
}

export function fetchSubmissions(formId: string, params: PageParams) {
  return api.get<PaginatedEnvelope<FormSubmission>>(`/forms/${formId}/submissions`, {
    params,
  });
}
