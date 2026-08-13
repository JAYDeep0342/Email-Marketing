import { Outlet } from 'react-router-dom';

/**
 * Auth layout — the container the login/signup/reset screens render into.
 *
 * Kept intentionally minimal in Chunk 3 (visual polish + logo mark come in
 * Chunk 4 alongside the real forms). The <Outlet /> renders whichever
 * child route is active.
 */
export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Email Marketing</h1>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
