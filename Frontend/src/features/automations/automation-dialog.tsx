import { Controller, useForm } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useListsList } from '@/features/lists/use-lists';
import { Automation, TRIGGER_TYPES } from './automations.api';
import { automationFormSchema, AutomationFormValues } from './automations.schemas';
import { useCreateAutomation, useUpdateAutomation } from './use-automations';

const TRIGGER_LABEL: Record<(typeof TRIGGER_TYPES)[number], string> = {
  contact_created: 'Contact created',
  contact_added_to_list: 'Contact added to a list',
  email_opened: 'Email opened',
  email_clicked: 'Email link clicked',
  form_submitted: 'Form submitted',
  manual: 'Manual enrollment only',
};

interface AutomationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. Editing only changes
   * name/triggerConfig — triggerType itself can't change after creation
   * (not supported by UpdateAutomationDto). */
  automation?: Automation | null;
  onCreated?: (id: string) => void;
}

export function AutomationDialog({
  open,
  onOpenChange,
  automation,
  onCreated,
}: AutomationDialogProps) {
  const isEdit = !!automation;
  const createMutation = useCreateAutomation();
  const updateMutation = useUpdateAutomation(automation?.id ?? '');
  const listsQuery = useListsList({ page: 1, limit: 100 });

  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationFormSchema),
    defaultValues: {
      name: automation?.name ?? '',
      triggerType: automation?.triggerType ?? 'manual',
      listId: (automation?.triggerConfig?.listId as string) ?? '',
    },
  });

  const triggerType = form.watch('triggerType');

  const onSubmit = async (values: AutomationFormValues) => {
    const triggerConfig =
      values.triggerType === 'contact_added_to_list' && values.listId
        ? { listId: values.listId }
        : {};
    if (isEdit && automation) {
      await updateMutation.mutateAsync({ name: values.name, triggerConfig });
      onOpenChange(false);
    } else {
      const created = await createMutation.mutateAsync({
        name: values.name,
        triggerType: values.triggerType,
        triggerConfig,
      });
      onOpenChange(false);
      onCreated?.(created.id);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit automation' : 'Create automation'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />

          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Controller
              control={form.control}
              name="triggerType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TRIGGER_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                The trigger type can't be changed after creation.
              </p>
            )}
          </div>

          {triggerType === 'contact_added_to_list' && (
            <div className="space-y-1.5">
              <Label>List</Label>
              <Controller
                control={form.control}
                name="listId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Which list?" />
                    </SelectTrigger>
                    <SelectContent>
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
          )}

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
