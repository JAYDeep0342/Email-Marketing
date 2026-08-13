import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import AuthLayout from '@/components/layouts/auth.layout';
import AppLayout from '@/components/layouts/app.layout';
import AdminLayout from '@/components/layouts/admin.layout';

import LoginPage from '@/auth/login.page';
import SignupPage from '@/auth/signup.page';
import ForgotPasswordPage from '@/auth/forgot-password.page';
import ResetPasswordPage from '@/auth/reset-password.page';
import VerifyEmailPage from '@/auth/verify-email.page';

import DashboardPage from '@/app/dashboard.page';
import AdminDashboardPage from '@/admin/dashboard.page';

import {
  RequireAuth,
  RequireGuest,
  RequirePlatformAdmin,
} from '@/auth/guards';

/**
 * Route tree — Chunk 4.
 *
 * Two auth sub-trees now:
 *
 *   /auth/*                      guest-only  (login, signup, forgot)
 *   /auth/reset-password         PUBLIC      (a user with a token
 *                                             might be logged in; they
 *                                             should still see the form)
 *   /auth/verify-email           PUBLIC      (same reasoning)
 *
 * The public two live OUTSIDE the RequireGuest wrapper so an already-
 * authenticated user clicking a reset link from their email actually
 * reaches the form instead of being bounced to /app.
 */
const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },

  // Guest-only auth (redirects to /app if already signed in)
  {
    path: '/auth',
    element: (
      <RequireGuest>
        <AuthLayout />
      </RequireGuest>
    ),
    children: [
      { index: true, element: <Navigate to="login" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
    ],
  },

  // Public auth routes — no guest guard (users may be logged in)
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
    ],
  },

  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
    ],
  },

  {
    path: '/admin',
    element: (
      <RequirePlatformAdmin>
        <AdminLayout />
      </RequirePlatformAdmin>
    ),
    children: [
      { index: true, element: <AdminDashboardPage /> },
    ],
  },

  { path: '*', element: <Navigate to="/app" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
