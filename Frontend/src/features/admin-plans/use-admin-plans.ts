import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { normalizeAxiosError } from '@/lib/api';
import {
  createPlan,
  CreatePlanPayload,
  deletePlan,
  fetchAdminPlans,
  updatePlan,
  UpdatePlanPayload,
} from './admin-plans.api';

const ADMIN_PLANS_KEY = ['admin-plans'] as const;

export function useAdminPlansList() {
  return useQuery({ queryKey: ADMIN_PLANS_KEY, queryFn: fetchAdminPlans });
}

function useInvalidateAdminPlans() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ADMIN_PLANS_KEY });
}

export function useCreatePlan() {
  const invalidate = useInvalidateAdminPlans();
  return useMutation({
    mutationFn: (payload: CreatePlanPayload) => createPlan(payload),
    onSuccess: () => {
      invalidate();
      toast.success('Plan created');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidateAdminPlans();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<UpdatePlanPayload>) =>
      updatePlan(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Plan updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeletePlan() {
  const invalidate = useInvalidateAdminPlans();
  return useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      invalidate();
      toast.success('Plan deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

// Also used for the "quick toggle" active/inactive switch on each row —
// same PATCH endpoint, just a one-field payload.
export function useTogglePlanActive() {
  const invalidate = useInvalidateAdminPlans();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updatePlan(id, { isActive }),
    onSuccess: (plan) => {
      invalidate();
      toast.success(plan.isActive ? 'Plan activated' : 'Plan deactivated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}
