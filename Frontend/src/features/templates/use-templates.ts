import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  createTemplate,
  createTemplateCategory,
  deleteTemplate,
  duplicateTemplate,
  fetchTemplateCategories,
  fetchTemplates,
  ListTemplatesParams,
  Template,
  TemplatePayload,
  updateTemplate,
} from './templates.api';

const TEMPLATES_KEY = 'templates-list' as const;

export function useTemplatesList(params: ListTemplatesParams) {
  return usePaginatedQuery<Template>([TEMPLATES_KEY, params], () => fetchTemplates(params));
}

export function useTemplateCategories() {
  return useQuery({ queryKey: ['template-categories'], queryFn: fetchTemplateCategories });
}

function useInvalidateTemplates() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
}

export function useCreateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      invalidate();
      toast.success('Template created');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<TemplatePayload>) =>
      updateTemplate(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Template updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      invalidate();
      toast.success('Template deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDuplicateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: duplicateTemplate,
    onSuccess: () => {
      invalidate();
      toast.success('Template duplicated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useCreateTemplateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createTemplateCategory(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['template-categories'] }),
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}
