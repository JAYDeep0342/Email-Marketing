import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form.field';
import { useAuthStore } from '@/stores/auth.store';
import { normalizeAxiosError } from '@/lib/api';
import { loginSchema, type LoginValues } from '@/auth/schemas';

/**
 * Login screen — production version.
 *
 * react-hook-form handles field state; zodResolver validates against
 * loginSchema on submit; @hookform/resolvers gives us typed values.
 *
 * We keep the actual login call in the auth store (so tokens land in the
 * one place that owns them), and only wrap it here with UX concerns:
 * loading state, error toast, redirect-to-origin.
 */
export default function LoginPage() {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const from = (location.state as { from?: { pathname: string } } | null)?.from
    ?.pathname;

  const onSubmit = async (values: LoginValues) => {
    try {
      await login(values);
      navigate(from ?? '/app', { replace: true });
    } catch (err) {
      const e = normalizeAxiosError(err);
      // Toast for network / server-side errors. Field-level errors
      // aren't expected from /auth/login — it's just credentials or not.
      toast.error(e.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back — enter your credentials to continue.
        </p>
      </div>

      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="space-y-1.5">
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="text-right">
          <Link
            to="/auth/forgot-password"
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link to="/auth/signup" className="text-primary hover:underline">
          Create one
        </Link>
      </div>
    </form>
  );
}
