import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  createSegment,
  deleteSegment,
  fetchSegments,
  PageParams,
  previewSegment,
  Segment,
  SegmentPayload,
  SegmentPreviewContact,
  updateSegment,
} from './segments.api';

const SEGMENTS_KEY = 'segments-list' as const;

export function useSegmentsList(params: PageParams) {
  return usePaginatedQuery<Segment>([SEGMENTS_KEY, params], () => fetchSegments(params));
}

function useInvalidateSegments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [SEGMENTS_KEY] });
}

export function useCreateSegment() {
  const invalidate = useInvalidateSegments();
  return useMutation({
    mutationFn: createSegment,
    onSuccess: () => {
      invalidate();
      toast.success('Segment created');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdateSegment() {
  const invalidate = useInvalidateSegments();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<SegmentPayload>) =>
      updateSegment(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Segment updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeleteSegment() {
  const invalidate = useInvalidateSegments();
  return useMutation({
    mutationFn: deleteSegment,
    onSuccess: () => {
      invalidate();
      toast.success('Segment deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useSegmentPreview(id: string, params: PageParams) {
  return usePaginatedQuery<SegmentPreviewContact>(
    ['segment-preview', id, params],
    () => previewSegment(id, params),
    { enabled: !!id },
  );
}
