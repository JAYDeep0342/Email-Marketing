import { api, apiCall } from '@/lib/api';

/**
 * Dashboard stats API — hand-mirrored against server/src/modules/tracking/
 * dashboard.controller.ts (Dashboard Pass 2). All three are plain
 * ApiEnvelope responses (no pagination), same as GET /plans etc.
 */

export const DASHBOARD_RANGE_DAYS = [7, 30, 90] as const;
export type DashboardRangeDays = (typeof DASHBOARD_RANGE_DAYS)[number];

export interface DashboardOverview {
  range: { days: number; since: string };
  totals: {
    totalSent: number;
    delivered: number;
    opens: number;
    uniqueOpens: number;
    clicks: number;
    bounces: number;
    complaints: number;
  };
  rates: {
    openRate: number;
    clickRate: number;
    bounceRate: number;
    complaintRate: number;
  };
}

export function fetchDashboardOverview(days: DashboardRangeDays) {
  return apiCall<DashboardOverview>(() =>
    api.get('/dashboard/overview', { params: { days } }),
  );
}

export interface DashboardActivityPoint {
  date: string; // "YYYY-MM-DD"
  count: number;
}

export function fetchDashboardActivity(days: DashboardRangeDays) {
  return apiCall<DashboardActivityPoint[]>(() =>
    api.get('/dashboard/activity', { params: { days } }),
  );
}

export interface TopCampaign {
  id: string;
  name: string;
  sentCount: number;
  openRate: number;
}

export function fetchTopCampaigns(limit = 5) {
  return apiCall<TopCampaign[]>(() =>
    api.get('/dashboard/top-campaigns', { params: { limit } }),
  );
}
