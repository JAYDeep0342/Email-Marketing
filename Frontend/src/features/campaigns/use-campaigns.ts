import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  CampaignPayload,
  CampaignListItem,
  CampaignRecipient,
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  fetchCampaign,
  fetchCampaignAnalytics,
  fetchCampaignPreview,
  fetchCampaigns,
  fetchCampaignStats,
  fetchCampaignTimeline,
  fetchRecipients,
  fetchSignatures,
  ListCampaignsParams,
  pauseCampaign,
  PageParams,
  removeRecipient,
  resolveRecipients,
  resumeCampaign,
  scheduleCampaign,
  unscheduleCampaign,
  updateCampaign,
} from './campaigns.api';

const CAMPAIGNS_KEY = 'campaigns-list' as const;
const CAMPAIGN_KEY = 'campaign-detail' as const;
const RECIPIENTS_KEY = 'campaign-recipients' as const;

export function useCampaignsList(params: ListCampaignsParams) {
  return usePaginatedQuery<CampaignListItem>([CAMPAIGNS_KEY, params], () =>
    fetchCampaigns(params),
  );
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: [CAMPAIGN_KEY, id],
    queryFn: () => fetchCampaign(id),
    enabled: !!id,
  });
}

export function useSignatures() {
  return useQuery({ queryKey: ['signatures'], queryFn: fetchSignatures });
}

function useInvalidateCampaigns(id?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
    if (id) qc.invalidateQueries({ queryKey: [CAMPAIGN_KEY, id] });
  };
}

export function useCreateCampaign() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      invalidate();
      toast.success('Campaign created');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdateCampaign(id: string) {
  const invalidate = useInvalidateCampaigns(id);
  return useMutation({
    mutationFn: (payload: Partial<CampaignPayload>) => updateCampaign(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Campaign updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeleteCampaign() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      invalidate();
      toast.success('Campaign deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDuplicateCampaign() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({
    mutationFn: duplicateCampaign,
    onSuccess: () => {
      invalidate();
      toast.success('Campaign duplicated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

// ---- Status actions ----
// Each shows the backend's own ConflictException/BadRequestException message
// verbatim on failure (e.g. "Cannot schedule a campaign with status 'sent'",
// "Campaign has no recipients") rather than a generic frontend message —
// those messages are the actual state-machine rules, worth showing as-is.

export function useScheduleCampaign(id: string) {
  const invalidate = useInvalidateCampaigns(id);
  return useMutation({
    mutationFn: (scheduledAt: string) => scheduleCampaign(id, scheduledAt),
    onSuccess: () => {
      invalidate();
      toast.success('Campaign scheduled');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUnscheduleCampaign(id: string) {
  const invalidate = useInvalidateCampaigns(id);
  return useMutation({
    mutationFn: () => unscheduleCampaign(id),
    onSuccess: () => {
      invalidate();
      toast.success('Campaign unscheduled');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function usePauseCampaign(id: string) {
  const invalidate = useInvalidateCampaigns(id);
  return useMutation({
    mutationFn: () => pauseCampaign(id),
    onSuccess: () => {
      invalidate();
      toast.success('Campaign paused');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useResumeCampaign(id: string) {
  const invalidate = useInvalidateCampaigns(id);
  return useMutation({
    mutationFn: () => resumeCampaign(id),
    onSuccess: () => {
      invalidate();
      toast.success('Campaign resumed');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useCancelCampaign(id: string) {
  const invalidate = useInvalidateCampaigns(id);
  return useMutation({
    mutationFn: () => cancelCampaign(id),
    onSuccess: () => {
      invalidate();
      toast.success('Campaign cancelled');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

// ---- Recipients ----

export function useResolveRecipients(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resolveRecipients(id),
    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: [RECIPIENTS_KEY, id] });
      qc.invalidateQueries({ queryKey: [CAMPAIGN_KEY, id] });
      toast.success(
        `${summary.total} recipient(s) resolved` +
          (summary.excluded.unsubscribed +
            summary.excluded.suppressed +
            summary.excluded.blacklisted +
            summary.excluded.duplicates >
          0
            ? ` (excluded ${summary.excluded.unsubscribed} unsubscribed, ${summary.excluded.suppressed} suppressed, ${summary.excluded.blacklisted} blacklisted, ${summary.excluded.duplicates} duplicates)`
            : ''),
      );
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useRecipients(id: string, params: PageParams) {
  return usePaginatedQuery<CampaignRecipient>([RECIPIENTS_KEY, id, params], () =>
    fetchRecipients(id, params),
  );
}

export function useRemoveRecipient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => removeRecipient(id, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RECIPIENTS_KEY, id] });
      qc.invalidateQueries({ queryKey: [CAMPAIGN_KEY, id] });
      toast.success('Recipient removed');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

// ---- Read-only extras ----

export function useCampaignStats(id: string) {
  return useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => fetchCampaignStats(id),
    enabled: !!id,
  });
}

export function useCampaignAnalytics(id: string) {
  return useQuery({
    queryKey: ['campaign-analytics', id],
    queryFn: () => fetchCampaignAnalytics(id),
    enabled: !!id,
  });
}

export function useCampaignTimeline(id: string) {
  return useQuery({
    queryKey: ['campaign-timeline', id],
    queryFn: () => fetchCampaignTimeline(id),
    enabled: !!id,
  });
}

export function useCampaignPreview(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['campaign-preview', id],
    queryFn: () => fetchCampaignPreview(id),
    enabled: enabled && !!id,
  });
}
