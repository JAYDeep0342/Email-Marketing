import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Template } from './templates.api';
import { templateFormSchema, TemplateFormValues } from './templates.schemas';
import {
  useCreateTemplate,
  useCreateTemplateCategory,
  useTemplateCategories,
  useUpdateTemplate,
} from './use-templates';

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  template?: Template | null;
}

const NO_CATEGORY = '__none__';

/**
 * Create/Edit template dialog. HTML body is a plain textarea for now (per
 * spec — "a simple textarea/code editor is fine"), with a hint that
 * {{firstName}} etc. merge variables are supported (EmailProcessor.merge()
 * substitutes them at send time, same mechanism verified in the Contacts
 * screen's live Gmail campaign test).
 */
export function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const isEdit = !!template;
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const categoriesQuery = useTemplateCategories();
  const createCategoryMutation = useCreateTemplateCategory();
  const [newCategoryName, setNewCategoryName] = useState('');

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: template?.name ?? '',
      categoryId: template?.categoryId ?? '',
      renderedHtml: template?.renderedHtml ?? '',
    },
  });

  const onSubmit = async (values: TemplateFormValues) => {
    const payload = {
      name: values.name,
      categoryId: values.categoryId || undefined,
      renderedHtml: values.renderedHtml || undefined,
    };
    if (isEdit && template) {
      await updateMutation.mutateAsync({ id: template.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const category = await createCategoryMutation.mutateAsync(name);
    form.setValue('categoryId', category.id);
    setNewCategoryName('');
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit template' : 'Create template'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />

          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="flex gap-2">
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value || NO_CATEGORY}
                    onValueChange={(v) => field.onChange(v === NO_CATEGORY ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                      {(categoriesQuery.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                }}
                className="h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renderedHtml">HTML body</Label>
            <Textarea
              id="renderedHtml"
              rows={12}
              placeholder={'<p>Hi {{firstName}},</p>\n<p>...</p>'}
              className="font-mono text-xs"
              {...form.register('renderedHtml')}
            />
            <p className="text-xs text-muted-foreground">
              Use merge variables like <code>{'{{firstName}}'}</code> — they're substituted
              per-contact when a campaign sends.
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
