import { Controller, useFieldArray, useForm as useReactHookForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField as TextField } from '@/components/ui/form.field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useListsList } from '@/features/lists/use-lists';
import { FORM_TYPES, FormSummary } from './forms.api';
import { formFormSchema, FormFormValues } from './forms.schemas';
import { useCreateForm, useUpdateForm } from './use-forms';

const NONE = '__none__';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  form?: FormSummary | null;
  onCreated?: (id: string) => void;
}

export function FormDialog({ open, onOpenChange, form: existingForm, onCreated }: FormDialogProps) {
  const isEdit = !!existingForm;
  const createMutation = useCreateForm();
  const updateMutation = useUpdateForm(existingForm?.id ?? '');
  const listsQuery = useListsList({ page: 1, limit: 100 });

  const form = useReactHookForm<FormFormValues>({
    resolver: zodResolver(formFormSchema),
    defaultValues: {
      name: existingForm?.name ?? '',
      type: existingForm?.type ?? 'embedded',
      listId: existingForm?.listId ?? '',
      isActive: existingForm ? (existingForm.isActive ? 'true' : 'false') : 'true',
      fields: existingForm?.fields ?? [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'fields' });

  const onSubmit = async (values: FormFormValues) => {
    const payload = {
      name: values.name,
      type: values.type,
      listId: values.listId || null,
      isActive: values.isActive === 'true',
      fields: values.fields,
    };
    if (isEdit && existingForm) {
      await updateMutation.mutateAsync(payload);
      onOpenChange(false);
    } else {
      const created = await createMutation.mutateAsync(payload);
      onOpenChange(false);
      onCreated?.(created.id);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit form' : 'Create form'}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
          noValidate
        >
          <TextField
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Active</Label>
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Add to list</Label>
              <Controller
                control={form.control}
                name="listId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {listsQuery.rows.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fields captured</Label>
            {fields.map((f, index) => (
              <div key={f.id} className="flex items-center gap-2">
                <Input
                  placeholder="field name (e.g. company)"
                  {...form.register(`fields.${index}.name`)}
                />
                <Input placeholder="label" {...form.register(`fields.${index}.label`)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => remove(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ name: '', label: '' })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add field
            </Button>
            <p className="text-xs text-muted-foreground">
              email is always captured by the public submit endpoint — these are extra
              fields on top of it.
            </p>
          </div>

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
