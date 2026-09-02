import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { normalizeAxiosError } from '@/lib/api';
import { cancelSubscription, createCheckout, fetchPlans } from './billing.api';

export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: fetchPlans });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: createCheckout,
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelSubscription,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      toast.success(res.message);
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}
