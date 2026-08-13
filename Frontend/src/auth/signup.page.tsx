import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form.field';
import { useAuthStore } from '@/stores/auth.store';
import { normalizeAxiosError } from '@/lib/api';
import { signupSchema, type SignupValues } from '@/auth/schemas';

/**
 * Signup — production version.
 *
 * Backend does two things on POST /auth/signup:
 *   1. Creates the Tenant, first User, and returns the AuthResponse.
 *   2. Calls SubscriptionsService.startTrial(tenantId) so the fresh
 *      tenant lands with a 14-day trial on the Business plan (seed data).
 *
 * Neither step is visible here — the frontend just receives tokens and
 * lands on /app, and Phase 2's dashboard reads the trial subscription
 * separately.
 */
export default function SignupPage() {
  const { signup } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { companyName: '', firstName: '', email: '', password: '' },
  });

  const onSubmit = async (values: SignupValues) => {
    try {
      await signup(values);
      toast.success('Welcome! Your 14-day trial has started.');
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error(normalizeAxiosError(err).message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Create your workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          14-day free trial · no card required.
        </p>
      </div>

      <FormField
        label="Workspace name"
        placeholder="Acme Marketing"
        autoComplete="organization"
        error={errors.companyName?.message}
        {...register('companyName')}
      />
      <FormField
        label="First name"
        autoComplete="given-name"
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Start free trial'}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/auth/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    </form>
  );
}
