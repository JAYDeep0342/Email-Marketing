import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, apiCall } from '@/lib/api';
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  LoginPayload,
  SignupPayload,
} from '@/types/api';

/**
 * Auth store — Zustand, persisted to localStorage under `auth-store`.
 *
 * State shape kept minimal:
 *   - user: full AuthUser or null
 *   - tokens: {accessToken, refreshToken} or null
 *   - status: hydration lifecycle flag so route guards don't flash the
 *     login screen while zustand is loading from localStorage on boot.
 *
 * We DON'T store derived flags like `isAuthenticated` — they're computed
 * from the pair (user + tokens). Storing them would let the two drift.
 *
 * lib/api.ts reads tokens straight from `useAuthStore.getState()` — see
 * the cycle note at the top of that file for why importing each other
 * here is safe.
 */

type Status = 'hydrating' | 'ready';

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  status: Status;

  // Actions
  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => void;

  // Internal — used by the axios interceptor after a successful refresh.
  setTokens: (tokens: AuthTokens) => void;

  // Derived helpers (functions, so re-renders track dependencies right)
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      status: 'hydrating',

      login: async (payload) => {
        const data = await apiCall<AuthResponse>(() =>
          api.post('/auth/login', payload),
        );
        set({
          user: data.user,
          tokens: { accessToken: data.accessToken, refreshToken: data.refreshToken },
        });
      },

      signup: async (payload) => {
        const data = await apiCall<AuthResponse>(() =>
          api.post('/auth/signup', payload),
        );
        set({
          user: data.user,
          tokens: { accessToken: data.accessToken, refreshToken: data.refreshToken },
        });
      },

      logout: () => {
        set({ user: null, tokens: null });
      },

      setTokens: (tokens) => set({ tokens }),

      isAuthenticated: () => !!get().user && !!get().tokens?.accessToken,
    }),
    {
      name: 'auth-store',
      // Only persist the essentials — status is per-session.
      partialize: (state) => ({ user: state.user, tokens: state.tokens }),
      onRehydrateStorage: () => (state) => {
        // Fired after zustand loads from localStorage. Flip status to
        // 'ready' so route guards can safely evaluate isAuthenticated().
        if (state) state.status = 'ready';
      },
    },
  ),
);
