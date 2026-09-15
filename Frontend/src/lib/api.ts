import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { ApiErrorBody, AuthTokens, PaginatedEnvelope, PaginationMeta } from '@/types/api';

/**
 * Axios client for the NestJS backend.
 *
 * baseURL is `/api` — Vite's dev proxy (vite.config.ts) forwards that to
 * localhost:3000 in dev. In production the frontend and backend can live at
 * the same origin behind a reverse proxy, so `/api` still works.
 *
 * Two interceptors:
 *
 *   1. Request: attach `Authorization: Bearer <accessToken>` to every
 *      call, read straight from `useAuthStore.getState()` at request time.
 *
 *   2. Response: on 401, try a single refresh. Concurrent 401s share ONE
 *      refresh promise via `refreshPromise` so we don't fire N refreshes
 *      when N requests hit an expired token simultaneously (thundering
 *      herd). After the refresh, retry each queued request once. If the
 *      refresh itself 401s, we call the store's logout to wipe tokens and
 *      let the router redirect to /auth/login.
 *
 * Explicit skip for /auth/refresh — a refresh call getting 401 must NOT
 * loop back into another refresh attempt.
 *
 * This file and auth.store.ts import each other (store needs `api`/
 * `apiCall` for its login/signup actions; this file needs `useAuthStore`
 * for tokens). That's a safe ESM cycle: both sides only touch the other's
 * export from INSIDE a function body (called later, once both modules have
 * finished evaluating), never at module-top-level. We used to avoid the
 * cycle with a manual `bindAuthStore()` side-effect binding instead — that
 * turned out to be fragile (a singleton set once, elsewhere, that could
 * desync from the live store under Vite HMR during a long dev session,
 * producing exactly the "401s the interceptor should have handled" bug
 * this replaces). Reading the store directly removes that whole class of
 * bug — there's nothing to bind, so nothing to get out of sync.
 */

export const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// ---- Request interceptor ----
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Response interceptor: 401 refresh ----

// Single-flight lock. While one refresh is in progress, other 401s wait for
// its result instead of starting their own.
let refreshPromise: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().tokens?.refreshToken;
  if (!refreshToken) return null;

  // Call refresh WITHOUT going through the axios instance's interceptors —
  // using a bare axios keeps this immune to the very loop we're preventing.
  try {
    const res = await axios.post<{ success: true; data: AuthTokens }>(
      '/api/auth/refresh',
      { refreshToken },
      { timeout: 10000 },
    );
    const tokens = res.data.data;
    useAuthStore.getState().setTokens(tokens);
    return tokens.accessToken;
  } catch {
    // Refresh failed — session is dead. Wipe tokens; the router will bounce
    // the user to /auth/login on the next protected navigation.
    useAuthStore.getState().logout();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    // Not a 401, or we already retried this exact request once — surface it.
    if (
      error.response?.status !== 401 ||
      original._retried ||
      original.url?.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    // Kick off (or join) the single refresh in flight.
    if (!refreshPromise) refreshPromise = refreshTokens();
    const newAccess = await refreshPromise;
    refreshPromise = null;

    if (!newAccess) {
      // Refresh failed — surface the original 401 as-is.
      return Promise.reject(error);
    }

    original._retried = true;
    if (original.headers) {
      original.headers.Authorization = `Bearer ${newAccess}`;
    }
    return api(original);
  },
);

/**
 * Convenience: unwrap the ApiEnvelope for callers. Every non-@RawResponse
 * endpoint returns `{ success: true, data: T }` — this pulls the `.data`.
 */
export async function apiCall<T>(
  fn: () => Promise<{ data: { data: T } }>,
): Promise<T> {
  const res = await fn();
  return res.data.data;
}

/**
 * Same idea as apiCall, but for list endpoints — `data` and `meta` are
 * siblings on the envelope (see PaginatedEnvelope), so unwrapping to just
 * `.data` would silently drop pagination info. Used by usePaginatedQuery.
 */
export async function apiCallPaginated<T>(
  fn: () => Promise<{ data: PaginatedEnvelope<T> }>,
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const res = await fn();
  return { data: res.data.data, meta: res.data.meta };
}

/**
 * Turn an axios error into a normalized ApiErrorBody['error'] object, so
 * UI code has ONE shape to render regardless of whether the error came
 * from a Nest ExceptionFilter, a network failure, or a timeout.
 */
export function normalizeAxiosError(err: unknown): ApiErrorBody['error'] {
  if (axios.isAxiosError(err)) {
    if (err.response?.data && typeof err.response.data === 'object') {
      const body = err.response.data as ApiErrorBody;
      if (body?.error) return body.error;
    }
    if (err.code === 'ECONNABORTED') {
      return { code: 'TIMEOUT', message: 'Request timed out. Try again.' };
    }
    if (!err.response) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server. Check your connection.',
      };
    }
    return {
      code: `HTTP_${err.response.status}`,
      message: err.message,
    };
  }
  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Something went wrong.',
  };
}
