import { keepPreviousData, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiCallPaginated } from '@/lib/api';
import type { PaginatedEnvelope, PaginationMeta } from '@/types/api';

/**
 * Shared data-fetching pattern for paginated list screens (contacts, lists,
 * campaigns, automations, ...). Wraps apiCallPaginated + useQuery with the
 * two things every one of those screens needs:
 *
 *   - keepPreviousData: paging to the next page doesn't flash a loading
 *     state over the whole table — the old rows stay put (see `isPlaceholderData`
 *     below) until the new page resolves.
 *   - a consistent { rows, meta, isLoading, isFetching, isError, error }
 *     shape so DataTable's props map 1:1 across every screen that uses it.
 *
 * `queryKey` should include every param the request depends on (page, limit,
 * filters, search) — same rule as any other useQuery call.
 */
export function usePaginatedQuery<T>(
  queryKey: readonly unknown[],
  fetchFn: () => Promise<{ data: PaginatedEnvelope<T> }>,
  options?: Omit<
    UseQueryOptions<{ data: T[]; meta: PaginationMeta }>,
    'queryKey' | 'queryFn'
  >,
) {
  const query = useQuery({
    queryKey,
    queryFn: () => apiCallPaginated(fetchFn),
    placeholderData: keepPreviousData,
    ...options,
  });

  return {
    rows: query.data?.data ?? [],
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
