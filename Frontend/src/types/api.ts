/**
 * Backend DTO types — hand-mirrored.
 *
 * These types must match what the NestJS backend actually returns. When the
 * backend changes a DTO, update this file. There's no auto-sync yet
 * (Swagger/openapi codegen is a cross-cutting item still pending — X3).
 *
 * Rule: only include fields the frontend actually reads. A DTO with 25
 * fields where the UI uses 8 -> declare 8. Keeps type errors surface-only
 * when the backend adds/renames things.
 */

// ---- Standard response envelope from ResponseInterceptor ----
// Every non-@RawResponse route returns { success, data }. Errors go
// through AllExceptionsFilter and take the shape below.

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;        // e.g. 'NOT_FOUND', 'QUOTA_EXCEEDED', 'VALIDATION_ERROR'
    message: string;
    details?: unknown;   // e.g. { metric, used, cap } for QUOTA_EXCEEDED
  };
}

// ---- Auth ----

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  // The backend's /auth/login and /auth/signup responses each return a
  // different partial slice of the user (login: id/email/tenantId; signup:
  // id/email/emailVerified). None of them currently include firstName,
  // lastName, or roles — those only show up via a future full-profile
  // endpoint. Marked optional here so the type matches what actually
  // arrives instead of promising fields that are always undefined.
  firstName?: string | null;
  lastName?: string | null;
  tenantId?: string;
  // Roles come as string names ('owner', 'admin', 'member'). Super-admin
  // sits on a separate PlatformAdmin table — we surface that as a boolean
  // once Step 20 ships. For now everyone is a tenant user.
  roles?: string[];
  isPlatformAdmin?: boolean; // reserved for Step 20
}

// The backend's AuthService.login/signup return tokens flat on the
// response object (`{ user, accessToken, refreshToken }`), NOT nested
// under a `tokens` key. Matches AuthService.issueTokens's return shape.
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

// ---- Signup DTO (matches AuthService.signup input) ----

export interface SignupPayload {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  companyName: string; // company/workspace name — becomes Tenant.name
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface VerifyEmailPayload {
  token: string;
}

// ---- Subscription (Billing 16A) ----
// Used by the trial banner + subscription screen.

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'unpaid'
  | 'ended'
  | 'pending';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  planId: string;
  currentPeriodStart: string | null; // ISO date
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan?: {
    id: string;
    name: string;
    code: string;
    priceCents: number;
    planLimit?: PlanLimit | null;
  };
}

export interface PlanLimit {
  maxContacts: number | null;
  maxLists: number | null;
  maxEmailsMonth: number | null;
  maxEmailsDay: number | null;
  maxUsers: number | null;
  maxCampaigns: number | null;
  maxAutomations: number | null;
  dedicatedIp: boolean;
  aiEnabled: boolean;
}
