import { api, apiCall } from '@/lib/api';
import type { PaginatedEnvelope } from '@/types/api';

/**
 * Segments API — hand-mirrored against server/src/modules/segments.
 *
 * Note: GET /segments was plain-array (no pagination) — extended to accept
 * page/limit and return {success,data,meta} via the same paginated() helper,
 * same treatment as GET /lists. There's also no GET /segments/:id — editing
 * reuses the full row already returned by the list (it includes `rules`),
 * same pattern as Lists' ListDialog before the list-detail work needed a
 * dedicated fetch.
 */

export type SegmentOp = 'eq' | 'neq' | 'contains';
export type SegmentMatch = 'all' | 'any';

export interface SegmentCondition {
  field: string; // 'status' | 'email' | 'firstName' | 'lastName' | 'attributes.<key>'
  op: SegmentOp;
  value: string;
}

export interface SegmentRules {
  match: SegmentMatch;
  conditions: SegmentCondition[];
}

export interface Segment {
  id: string;
  name: string;
  rules: SegmentRules;
  createdAt: string;
}

export interface PageParams {
  page: number;
  limit: number;
}

export function fetchSegments(params: PageParams) {
  return api.get<PaginatedEnvelope<Segment>>('/segments', { params });
}

export interface SegmentPayload {
  name: string;
  rules: SegmentRules;
}

export function createSegment(payload: SegmentPayload) {
  return apiCall<Segment>(() => api.post('/segments', payload));
}

export function updateSegment(id: string, payload: Partial<SegmentPayload>) {
  return apiCall<Segment>(() => api.patch(`/segments/${id}`, payload));
}

export function deleteSegment(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/segments/${id}`));
}

// Raw Contact rows (no select clause on the backend) — only the fields the
// preview table actually renders are declared here.
export interface SegmentPreviewContact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

export function previewSegment(id: string, params: PageParams) {
  return api.get<PaginatedEnvelope<SegmentPreviewContact>>(`/segments/${id}/preview`, {
    params,
  });
}
