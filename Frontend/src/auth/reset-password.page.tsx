import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form.field';
import { useAuthMutations } from '@/auth/use-auth-mutations';
import { normalizeAxiosError } from '@/lib/api';
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from '@/auth/schemas';

/**
 * Reset password.
 *
 * Token comes from the URL — the email link points at
 * /auth/reset-password?token=xxxxx. We validate the token exists
 * before showing the form; a missing token is treated as an invalid
 * link (don't waste the user's time typing a password we can't submit).
 *
 * On success we redirect to /auth/login rather than auto-signing in —
 * because the reset endpoint doesn't (and shouldn't) return session
 * tokens. Standard SaaS flow.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { resetPassword } = useAuthMutations();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold">Invalid reset link</h2>
        <p className="text-sm text-muted-foreground">
          This link is missing its token. Request a new one below.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/auth/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = async (values: ResetPasswordValues) => {
    try {
      await resetPassword.mutateAsync({ token, password: values.password });
      toast.success('Password reset. Sign in with your new password.');
      navigate('/auth/login', { replace: true });
    } catch (err) {
      toast.error(normalizeAxiosError(err).message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Set a new password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose something at least 8 characters.
        </p>
      </div>

      <FormField
        label="New password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <FormField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
