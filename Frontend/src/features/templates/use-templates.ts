import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  createTemplate,
  createTemplateCategory,
  deleteTemplate,
  duplicateTemplate,
  fetchTemplate,
  fetchTemplateCategories,
  fetchTemplates,
  ListTemplatesParams,
  Template,
  TemplatePayload,
  updateTemplate,
} from './templates.api';

const TEMPLATES_KEY = 'templates-list' as const;
const TEMPLATE_KEY = 'template-detail' as const;

export function useTemplatesList(params: ListTemplatesParams) {
  return usePaginatedQuery<Template>([TEMPLATES_KEY, params], () => fetchTemplates(params));
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: [TEMPLATE_KEY, id],
    queryFn: () => fetchTemplate(id),
    enabled: !!id,
  });
}

export function useTemplateCategories() {
  return useQuery({ queryKey: ['template-categories'], queryFn: fetchTemplateCategories });
}

function useInvalidateTemplates(id?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
    if (id) qc.invalidateQueries({ queryKey: [TEMPLATE_KEY, id] });
  };
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

export function useUpdateTemplate(id?: string) {
  const invalidate = useInvalidateTemplates(id);
  return useMutation({
    mutationFn: ({ id: mutationId, ...payload }: { id: string } & Partial<TemplatePayload>) =>
      updateTemplate(mutationId, payload),
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
