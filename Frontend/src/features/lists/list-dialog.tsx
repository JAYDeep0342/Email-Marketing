import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form.field';
import { ListSummary } from './lists.api';
import { listFormSchema, ListFormValues } from './lists.schemas';
import { useCreateList, useUpdateList } from './use-lists';

interface ListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  list?: ListSummary | null;
}

/**
 * Add/Edit list dialog — same shape as contacts/contact-dialog.tsx (one
 * component, two modes, keyed by the caller so switching remounts it).
 */
export function ListDialog({ open, onOpenChange, list }: ListDialogProps) {
  const isEdit = !!list;
  const createMutation = useCreateList();
  const updateMutation = useUpdateList();

  const form = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: {
      name: list?.name ?? '',
      description: list?.description ?? '',
    },
  });

  const onSubmit = async (values: ListFormValues) => {
    const payload = {
      name: values.name,
      description: values.description || undefined,
    };
    if (isEdit && list) {
      await updateMutation.mutateAsync({ id: list.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit list' : 'Create list'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <FormField
            label="Description (optional)"
            error={form.formState.errors.description?.message}
            {...form.register('description')}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
