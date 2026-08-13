import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

/**
 * TanStack Query client — global config.
 *
 * Defaults tuned for a data-heavy admin dashboard:
 *
 *   - staleTime 30s: most list screens tolerate being 30s stale between
 *     visits; nobody needs a hammer on the API when they tab back.
 *   - retry: skip 4xx (they will never succeed on retry) and skip 401
 *     (the axios interceptor already handles refresh). Retry only network
 *     / 5xx errors, up to 2 times.
 *   - refetchOnWindowFocus: false. Modern browsers fire focus events
 *     constantly on tab switch; too noisy for our use case. Callers who
 *     genuinely need "live" data can opt in per query.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status && status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      // Mutations never auto-retry — same click twice = same double
      // request, we don't want that decided silently.
      retry: false,
    },
  },
});
