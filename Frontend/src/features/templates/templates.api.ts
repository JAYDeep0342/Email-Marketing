import { api, apiCall } from '@/lib/api';
import type { PaginatedEnvelope } from '@/types/api';

/**
 * Templates API — hand-mirrored against server/src/modules/template.
 *
 * Note: Template has NO `subject` field (checked prisma/schema.prisma) —
 * subject/fromName/fromEmail live on Campaign instead. The template editor
 * here is just name + category + HTML body; subject is set per-campaign
 * (see features/campaigns).
 */

const BUILDER_TYPES = ['classic', 'pro'] as const;
export type BuilderType = (typeof BUILDER_TYPES)[number];

export interface TemplateCategory {
  id: string;
  name: string;
  tenantId: string | null; // null = shared gallery category, read-only
}

export interface Template {
  id: string;
  name: string;
  builderType: BuilderType;
  categoryId: string | null;
  isGallery: boolean;
  renderedHtml: string | null;
  // GrapesJS project data (components/styles/etc.) for 'pro' templates — null
  // for 'classic' (plain-HTML) templates, which have no design to re-open.
  designJson: Record<string, unknown> | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTemplatesParams {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
}

export function fetchTemplates(params: ListTemplatesParams) {
  return api.get<PaginatedEnvelope<Template>>('/templates', { params });
}

export function fetchTemplate(id: string) {
  return apiCall<Template>(() => api.get(`/templates/${id}`));
}

export interface TemplatePayload {
  name: string;
  categoryId?: string;
  renderedHtml?: string;
  designJson?: Record<string, unknown>;
  builderType?: BuilderType;
}

export function createTemplate(payload: TemplatePayload) {
  return apiCall<Template>(() => api.post('/templates', payload));
}

export function updateTemplate(id: string, payload: Partial<TemplatePayload>) {
  return apiCall<Template>(() => api.patch(`/templates/${id}`, payload));
}

export function deleteTemplate(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/templates/${id}`));
}

export function duplicateTemplate(id: string) {
  return apiCall<Template>(() => api.post(`/templates/${id}/duplicate`));
}

// ---- Template categories ----

export function fetchTemplateCategories() {
  return apiCall<TemplateCategory[]>(() => api.get('/template-categories'));
}

export function createTemplateCategory(name: string) {
  return apiCall<TemplateCategory>(() => api.post('/template-categories', { name }));
}
