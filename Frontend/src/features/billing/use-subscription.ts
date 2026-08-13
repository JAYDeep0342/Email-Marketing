import { useQuery } from '@tanstack/react-query';
import { api, apiCall } from '@/lib/api';
import type { Subscription } from '@/types/api';
import { useAuthStore } from '@/stores/auth.store';

/**
 * useSubscription — reads GET /billing/subscription.
 *
 * Backend endpoint returns the ONE active subscription for the current
 * tenant (status in trialing/active/past_due/unpaid/pending). null is a
 * valid response for tenants with no subscription (freshly-created before
 * the trial started, or fully lapsed).
 *
 * Enabled only when the user is signed in — no point firing this on the
 * login page. Uses the shared queryClient defaults (30s staleTime, no
 * retry on 4xx, no refetchOnWindowFocus).
 */
export function useSubscription() {
  const authed = useAuthStore((s) => s.isAuthenticated());

  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () =>
      apiCall<Subscription | null>(() => api.get('/billing/subscription')),
    enabled: authed,
  });
}
