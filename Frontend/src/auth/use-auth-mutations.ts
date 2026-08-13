import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ForgotPasswordPayload,
  ResetPasswordPayload,
  VerifyEmailPayload,
} from '@/types/api';

/**
 * Auth mutations that DON'T touch auth store state.
 *
 * login and signup live in auth.store.ts because they mutate `user`/`tokens`
 * — the store's the single source of truth for that. These three don't:
 * they only trigger a backend side effect (send email, verify token) and
 * report success/failure.
 *
 * Grouped here so pages can call `const { forgotPassword } = useAuthMutations()`
 * instead of re-declaring useMutation blocks each time.
 *
 * Endpoint paths assumed:
 *   POST /auth/forgot-password  { email }
 *   POST /auth/reset-password   { token, password }
 *   POST /auth/verify-email     { token }
 * Adjust if the backend uses different paths.
 */
export function useAuthMutations() {
  const forgotPassword = useMutation({
    mutationFn: (payload: ForgotPasswordPayload) =>
      api.post('/auth/forgot-password', payload),
  });

  const resetPassword = useMutation({
    mutationFn: (payload: ResetPasswordPayload) =>
      api.post('/auth/reset-password', payload),
  });

  const verifyEmail = useMutation({
    mutationFn: (payload: VerifyEmailPayload) =>
      api.post('/auth/verify-email', payload),
  });

  return { forgotPassword, resetPassword, verifyEmail };
}
