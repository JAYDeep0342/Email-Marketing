import { api, apiCall } from '@/lib/api';
import type { PaginatedEnvelope } from '@/types/api';

/**
 * Campaigns API — hand-mirrored against server/src/modules/campaigns (and
 * the sibling AnalyticsController in modules/tracking, which is mounted on
 * the same /campaigns/:id/analytics(*) path).
 */

export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'paused',
  'cancelled',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface CampaignTarget {
  type: 'list' | 'segment';
  id: string;
  name: string | null;
}

export interface CampaignListItem {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  template: { id: string; name: string; isGallery: boolean } | null;
  signature: { id: string; name: string; fromEmail: string } | null;
  recipientCount: number;
  target: CampaignTarget | null;
  sentCount: number;
  totalRecipients: number;
  openRate: number;
  clickRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDetail {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  template: { id: string; name: string; isGallery: boolean } | null;
  signature: {
    id: string;
    name: string;
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    isVerified: boolean;
  } | null;
  list: { id: string; name: string } | null;
  segment: { id: string; name: string } | null;
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListCampaignsParams {
  page: number;
  limit: number;
  status?: CampaignStatus;
  search?: string;
}

export function fetchCampaigns(params: ListCampaignsParams) {
  return api.get<PaginatedEnvelope<CampaignListItem>>('/campaigns', { params });
}

export function fetchCampaign(id: string) {
  return apiCall<CampaignDetail>(() => api.get(`/campaigns/${id}`));
}

export interface CampaignPayload {
  name: string;
  subject: string;
  preheader?: string;
  fromName?: string;
  fromEmail?: string;
  signatureId?: string;
  templateId?: string;
  listId?: string;
  segmentId?: string;
}

export function createCampaign(payload: CampaignPayload) {
  return apiCall<CampaignDetail>(() => api.post('/campaigns', payload));
}

export function updateCampaign(id: string, payload: Partial<CampaignPayload>) {
  return apiCall<CampaignDetail>(() => api.patch(`/campaigns/${id}`, payload));
}

export function deleteCampaign(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/campaigns/${id}`));
}

export function duplicateCampaign(id: string) {
  return apiCall<CampaignDetail>(() => api.post(`/campaigns/${id}/duplicate`));
}

export function scheduleCampaign(id: string, scheduledAt: string) {
  return apiCall<CampaignDetail & { recipients: AudienceSummary }>(() =>
    api.post(`/campaigns/${id}/schedule`, { scheduledAt }),
  );
}

export function unscheduleCampaign(id: string) {
  return apiCall<CampaignDetail>(() => api.post(`/campaigns/${id}/unschedule`));
}

export function pauseCampaign(id: string) {
  return apiCall<CampaignDetail>(() => api.post(`/campaigns/${id}/pause`));
}

export function resumeCampaign(id: string) {
  return apiCall<CampaignDetail & { recipients: AudienceSummary }>(() =>
    api.post(`/campaigns/${id}/resume`),
  );
}

export function cancelCampaign(id: string) {
  return apiCall<CampaignDetail>(() => api.post(`/campaigns/${id}/cancel`));
}

// ---- Recipients ----

export interface AudienceSummary {
  total: number;
  excluded: {
    unsubscribed: number;
    suppressed: number;
    blacklisted: number;
    duplicates: number;
  };
}

export function resolveRecipients(id: string) {
  return apiCall<AudienceSummary>(() => api.post(`/campaigns/${id}/resolve-recipients`));
}

export interface CampaignRecipient {
  contactId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string | null;
  addedAt: string;
}

export interface PageParams {
  page: number;
  limit: number;
}

export function fetchRecipients(id: string, params: PageParams) {
  return api.get<PaginatedEnvelope<CampaignRecipient>>(`/campaigns/${id}/recipients`, {
    params,
  });
}

export function removeRecipient(id: string, contactId: string) {
  return apiCall<{ message: string }>(() =>
    api.delete(`/campaigns/${id}/recipients/${contactId}`),
  );
}

// ---- Read-only extras ----

export interface CampaignStats {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openCount: number;
  uniqueOpenCount: number;
  clickCount: number;
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
}

export function fetchCampaignStats(id: string) {
  return apiCall<CampaignStats>(() => api.get(`/campaigns/${id}/stats`));
}

export interface CampaignAnalytics {
  campaign: { id: string; name: string; status: CampaignStatus; sentAt: string | null };
  totals: {
    totalRecipients: number;
    sent: number;
    delivered: number;
    opens: number;
    uniqueOpens: number;
    clicks: number;
    bounces: number;
    complaints: number;
    unsubscribes: number;
  };
  rates: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    complaintRate: number;
  };
}

export function fetchCampaignAnalytics(id: string) {
  return apiCall<CampaignAnalytics>(() => api.get(`/campaigns/${id}/analytics`));
}

export interface CampaignTimelinePoint {
  day: string;
  type: string;
  count: number;
}

export function fetchCampaignTimeline(id: string) {
  return apiCall<CampaignTimelinePoint[]>(() => api.get(`/campaigns/${id}/analytics/timeline`));
}

export interface CampaignPreview {
  subject: string;
  preheader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  template: { id: string; name: string } | null;
  html: string | null;
}

export function fetchCampaignPreview(id: string) {
  return apiCall<CampaignPreview>(() => api.get(`/campaigns/${id}/preview`));
}

// ---- Signatures (used only as the campaign sender picker here — no
// dedicated Signatures screen was requested in this batch) ----

export interface Signature {
  id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  isVerified: boolean;
}

export function fetchSignatures() {
  return apiCall<Signature[]>(() => api.get('/signatures'));
}
