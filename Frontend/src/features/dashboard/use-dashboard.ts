import { useQuery } from '@tanstack/react-query';
import {
  DashboardRangeDays,
  fetchDashboardActivity,
  fetchDashboardOverview,
  fetchTopCampaigns,
} from './dashboard.api';

export function useDashboardOverview(days: DashboardRangeDays) {
  return useQuery({
    queryKey: ['dashboard-overview', days],
    queryFn: () => fetchDashboardOverview(days),
  });
}

export function useDashboardActivity(days: DashboardRangeDays) {
  return useQuery({
    queryKey: ['dashboard-activity', days],
    queryFn: () => fetchDashboardActivity(days),
  });
}

export function useTopCampaigns(limit = 5) {
  return useQuery({
    queryKey: ['dashboard-top-campaigns', limit],
    queryFn: () => fetchTopCampaigns(limit),
  });
}
