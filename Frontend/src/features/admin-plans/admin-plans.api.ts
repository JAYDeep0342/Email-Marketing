import { api, apiCall } from '@/lib/api';
import type { PlanLimit } from '@/types/api';

/**
 * Admin Plans API — hand-mirrored against server/src/modules/billing
 * (AdminPlansController, /admin/plans/*, guarded by PlatformAdminGuard).
 *
 * GET /admin/plans returns a plain array (ApiEnvelope<AdminPlan[]>, no
 * pagination) — same as the public GET /plans this mirrors, just unfiltered
 * (active + inactive).
 *
 * Note: there's no GET /currencies endpoint, so the currency picker in the
 * plan dialog is built by collecting the distinct {id,code,symbol} already
 * present on the loaded plans, not from a dedicated lookup.
 */

export const BILLING_PERIODS = ['monthly', 'yearly'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export interface AdminCurrency {
  id: string;
  code: string;
  symbol: string;
}

export interface AdminPlan {
  id: string;
  name: string;
  code: string;
  priceCents: number;
  currencyId: string | null;
  billingPeriod: BillingPeriod;
  planType: string;
  isActive: boolean;
  createdAt: string;
  planLimit: PlanLimit | null;
  currency: AdminCurrency | null;
}

export function fetchAdminPlans() {
  return apiCall<AdminPlan[]>(() => api.get('/admin/plans'));
}

// Limit fields are nullable on the wire — null means "unlimited" and must be
// sent explicitly to clear a previously-set cap (omitting the key leaves it
// unchanged, since UpdatePlanDto only upserts PlanLimit when a limit field
// is present in the payload at all).
export interface PlanLimitPayload {
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

export interface CreatePlanPayload extends PlanLimitPayload {
  name: string;
  code: string;
  priceCents: number;
  currencyId?: string;
  billingPeriod: BillingPeriod;
  planType: string;
  isActive: boolean;
}

// code is NOT part of UpdatePlanDto — the backend rejects unknown properties
// (whitelist + forbidNonWhitelisted), so it must never be sent on update.
export type UpdatePlanPayload = Omit<CreatePlanPayload, 'code'>;

export function createPlan(payload: CreatePlanPayload) {
  return apiCall<AdminPlan>(() => api.post('/admin/plans', payload));
}

export function updatePlan(id: string, payload: Partial<UpdatePlanPayload>) {
  return apiCall<AdminPlan>(() => api.patch(`/admin/plans/${id}`, payload));
}

export function deletePlan(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/admin/plans/${id}`));
}
