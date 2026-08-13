import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form.field';
import { useAuthMutations } from '@/auth/use-auth-mutations';
import { normalizeAxiosError } from '@/lib/api';
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '@/auth/schemas';

/**
 * Forgot password.
 *
 * On successful POST /auth/forgot-password we ALWAYS show the same
 * "check your email" message regardless of whether the email exists.
 * This is standard practice — leaking whether an email is registered is
 * a low-severity but real information disclosure bug. Assume the backend
 * also returns 200 for both cases (many do). If it 4xx's for unknown
 * emails, we still show the neutral message.
 */
export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuthMutations();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    try {
      await forgotPassword.mutateAsync(values);
    } catch (err) {
      // We intentionally do NOT surface backend errors here — see comment
      // above. Only network-level failures should tell the user something
      // went wrong.
      const e = normalizeAxiosError(err);
      if (e.code === 'NETWORK_ERROR' || e.code === 'TIMEOUT') {
        toast.error(e.message);
        return;
      }
    }
    // Neutral success message. Clear the form.
    toast.success('If that email is registered, a reset link is on its way.');
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Reset your password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your account email and we'll send you a reset link.
        </p>
      </div>

      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Send reset link'}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        <Link to="/auth/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
