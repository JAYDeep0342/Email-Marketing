import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { normalizeAxiosError } from '@/lib/api';
import {
  createForm,
  deleteForm,
  fetchForm,
  fetchForms,
  fetchSubmissions,
  FormPayload,
  FormSubmission,
  FormSummary,
  PageParams,
  updateForm,
} from './forms.api';

const FORMS_KEY = 'forms-list' as const;
const FORM_KEY = 'form-detail' as const;
const SUBMISSIONS_KEY = 'form-submissions' as const;

export function useFormsList(params: PageParams) {
  return usePaginatedQuery<FormSummary>([FORMS_KEY, params], () => fetchForms(params));
}

export function useForm(id: string) {
  return useQuery({
    queryKey: [FORM_KEY, id],
    queryFn: () => fetchForm(id),
    enabled: !!id,
  });
}

function useInvalidateForms(id?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [FORMS_KEY] });
    if (id) qc.invalidateQueries({ queryKey: [FORM_KEY, id] });
  };
}

export function useCreateForm() {
  const invalidate = useInvalidateForms();
  return useMutation({
    mutationFn: createForm,
    onSuccess: () => {
      invalidate();
      toast.success('Form created');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useUpdateForm(id: string) {
  const invalidate = useInvalidateForms(id);
  return useMutation({
    mutationFn: (payload: Partial<FormPayload>) => updateForm(id, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Form updated');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useDeleteForm() {
  const invalidate = useInvalidateForms();
  return useMutation({
    mutationFn: deleteForm,
    onSuccess: () => {
      invalidate();
      toast.success('Form deleted');
    },
    onError: (err) => toast.error(normalizeAxiosError(err).message),
  });
}

export function useSubmissions(formId: string, params: PageParams) {
  return usePaginatedQuery<FormSubmission>([SUBMISSIONS_KEY, formId, params], () =>
    fetchSubmissions(formId, params),
  );
}
