import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  activateAutomation,
  AutomationListItem,
  AutomationPayload,
  AutomationRun,
  AutomationStep,
  createAutomation,
  deleteAutomation,
  enrollContact,
  fetchAutomation,
  fetchAutomations,
  fetchRuns,
  PageParams,
  pauseAutomation,
  setAutomationSteps,
  updateAutomation,
} from './automations.api';

const AUTOMATIONS_KEY = 'automations-list' as const;
const AUTOMATION_KEY = 'automation-detail' as const;
const RUNS_KEY = 'automation-runs' as const;

export function useAutomationsList(params: PageParams) {
  return usePaginatedQuery<AutomationListItem>([AUTOMATIONS_KEY, params], () =>
    fetchAutomations(params),
  );
}

export function useAutomation(id: string) {
  return useQuery({
    queryKey: [AUTOMATION_KEY, id],
    queryFn: () => fetchAutomation(id),
    enabled: !!id,
  });
}

function useInvalidateAutomations(id?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [AUTOMATIONS_KEY] });
    if (id) qc.invalidateQueries({ queryKey: [AUTOMATION_KEY, id] });
  };
}

export function useCreateAutomation() {
  const invalidate = useInvalidateAutomations();
  return useMutation({
    mutationFn: createAutomation,
    onSuccess: () => {
      invalidate();
      toast.success('Automation created');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdateAutomation(id: string) {
  const invalidate = useInvalidateAutomations(id);
  return useMutation({
    mutationFn: (payload: Partial<Pick<AutomationPayload, 'name' | 'triggerConfig'>>) =>
      updateAutomation(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Automation updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeleteAutomation() {
  const invalidate = useInvalidateAutomations();
  return useMutation({
    mutationFn: deleteAutomation,
    onSuccess: () => {
      invalidate();
      toast.success('Automation deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useSetAutomationSteps(id: string) {
  const invalidate = useInvalidateAutomations(id);
  return useMutation({
    mutationFn: (steps: AutomationStep[]) => setAutomationSteps(id, steps),
    onSuccess: () => {
      invalidate();
      toast.success('Steps saved');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useActivateAutomation(id: string) {
  const invalidate = useInvalidateAutomations(id);
  return useMutation({
    mutationFn: () => activateAutomation(id),
    onSuccess: () => {
      invalidate();
      toast.success('Automation activated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function usePauseAutomation(id: string) {
  const invalidate = useInvalidateAutomations(id);
  return useMutation({
    mutationFn: () => pauseAutomation(id),
    onSuccess: () => {
      invalidate();
      toast.success('Automation paused');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useEnrollContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => enrollContact(id, contactId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: [RUNS_KEY, id] });
      toast.success(res.message);
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useRuns(id: string, params: PageParams) {
  return usePaginatedQuery<AutomationRun>([RUNS_KEY, id, params], () => fetchRuns(id, params));
}
