import { api, apiCall } from '@/lib/api';
import type { PlanLimit } from '@/types/api';

/**
 * Billing API — plans + checkout/cancel. GET /billing/subscription itself is
 * already covered by use-subscription.ts; this file adds the two actions
 * plus the public plans list (both hand-mirrored against
 * server/src/modules/billing).
 */

export interface Currency {
  code: string;
  symbol: string;
}

export interface Plan {
  id: string;
  name: string;
  code: string;
  priceCents: number;
  billingPeriod: 'monthly' | 'yearly';
  planType: string;
  isActive: boolean;
  planLimit: PlanLimit | null;
  currency: Currency | null;
}

export function fetchPlans() {
  return apiCall<Plan[]>(() => api.get('/plans'));
}

export interface CheckoutResult {
  checkoutUrl: string;
  razorpaySubscriptionId: string;
}

export function createCheckout(planId: string) {
  return apiCall<CheckoutResult>(() => api.post('/billing/subscription/checkout', { planId }));
}

export function cancelSubscription() {
  return apiCall<{ message: string }>(() => api.post('/billing/subscription/cancel'));
}
