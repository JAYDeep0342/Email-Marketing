import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Route guards.
 *
 * All three guards wait for the auth store to finish rehydrating from
 * localStorage before making a decision — otherwise on hard-refresh the
 * user would flash the login screen for one paint before we realise they
 * already have a valid session.
 *
 * `from` is captured on the redirect so after a fresh login we can send
 * the user back to the page they were trying to reach.
 */

interface Props {
  children: React.ReactNode;
}

/** Redirect to /auth/login if not authenticated. */
export function RequireAuth({ children }: Props) {
  const { status, isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (status === 'hydrating') {
    return <HydratingFallback />;
  }

  if (!isAuthenticated()) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/** Redirect to /app if already authenticated (used on login/signup). */
export function RequireGuest({ children }: Props) {
  const { status, isAuthenticated } = useAuthStore();

  if (status === 'hydrating') {
    return <HydratingFallback />;
  }

  if (isAuthenticated()) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

/**
 * Reserved for Step 20 — Platform Admin. Right now `isPlatformAdmin` is
 * always undefined so this always redirects. That's intentional: any
 * request to /admin/* on the current backend goes to a tenant-admin API,
 * not a super-admin one. Once Step 20 ships and the login response
 * carries `isPlatformAdmin`, this guard starts working automatically.
 */
export function RequirePlatformAdmin({ children }: Props) {
  const { status, user, isAuthenticated } = useAuthStore();

  if (status === 'hydrating') {
    return <HydratingFallback />;
  }

  if (!isAuthenticated()) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!user?.isPlatformAdmin) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

/**
 * Neutral loading state shown while zustand rehydrates. Deliberately
 * blank-ish — no spinner, no logo — so the transition into the real
 * layout doesn't feel like a page load.
 */
function HydratingFallback() {
  return <div className="min-h-screen bg-background" />;
}
