import { Controller, useFieldArray, useForm } from 'react-hook-form';
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
import { FormField } from '@/components/ui/form.field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segment, SegmentOp } from './segments.api';
import { segmentFormSchema, SegmentFormValues } from './segments.schemas';
import { useCreateSegment, useUpdateSegment } from './use-segments';

const OP_LABEL: Record<SegmentOp, string> = {
  eq: 'equals',
  neq: 'does not equal',
  contains: 'contains',
};

interface SegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  segment?: Segment | null;
}

/**
 * Create/Edit segment dialog — a simple rule builder (field/op/value rows)
 * over react-hook-form's useFieldArray. Field is free text on purpose:
 * the backend whitelists status/email/firstName/lastName/attributes.<key>
 * and returns a clear 400 for anything else, so a plain Input covers the
 * "simple" ask without duplicating that whitelist in the frontend too.
 */
export function SegmentDialog({ open, onOpenChange, segment }: SegmentDialogProps) {
  const isEdit = !!segment;
  const createMutation = useCreateSegment();
  const updateMutation = useUpdateSegment();

  const form = useForm<SegmentFormValues>({
    resolver: zodResolver(segmentFormSchema),
    defaultValues: {
      name: segment?.name ?? '',
      match: segment?.rules.match ?? 'all',
      conditions: segment?.rules.conditions ?? [{ field: 'status', op: 'eq', value: 'subscribed' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'conditions' });

  const onSubmit = async (values: SegmentFormValues) => {
    const payload = {
      name: values.name,
      rules: { match: values.match, conditions: values.conditions },
    };
    if (isEdit && segment) {
      await updateMutation.mutateAsync({ id: segment.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit segment' : 'Create segment'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />

          <div className="space-y-1.5">
            <Label>Match</Label>
            <Controller
              control={form.control}
              name="match"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All conditions (AND)</SelectItem>
                    <SelectItem value="any">Any condition (OR)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Conditions</Label>
            {form.formState.errors.conditions?.root?.message && (
              <p className="text-xs text-destructive">
                {form.formState.errors.conditions.root.message}
              </p>
            )}
            {fields.map((f, index) => (
              <div key={f.id} className="flex items-start gap-2">
                <Input
                  placeholder="field (status, email, attributes.plan…)"
                  {...form.register(`conditions.${index}.field`)}
                />
                <Controller
                  control={form.control}
                  name={`conditions.${index}.op`}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-40 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(OP_LABEL) as SegmentOp[]).map((op) => (
                          <SelectItem key={op} value={op}>
                            {OP_LABEL[op]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Input placeholder="value" {...form.register(`conditions.${index}.value`)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ field: '', op: 'eq', value: '' })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add condition
            </Button>
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
