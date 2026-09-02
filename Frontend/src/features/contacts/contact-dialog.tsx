import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { CONTACT_STATUSES, Contact, ContactStatus, ContactTag } from './contacts.api';
import { createContactSchema, editContactSchema } from './contacts.schemas';
import {
  useAddContactTag,
  useCreateContact,
  useCreateTag,
  useRemoveContactTag,
  useTags,
  useUpdateContact,
} from './use-contacts';

const STATUS_LABEL: Record<(typeof CONTACT_STATUSES)[number], string> = {
  subscribed: 'Subscribed',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Complained',
};

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  contact?: Contact | null;
}

// One value bag covers both modes (`email` only matters — and is only
// rendered/validated — in create mode) so a single useForm call works for
// both without a union-type/resolver-cast dance.
interface ContactFormValues {
  email?: string;
  firstName?: string;
  lastName?: string;
  status: ContactStatus;
}

/**
 * Add/Edit contact dialog — one component, two modes, keyed by the caller
 * (`key={contact?.id ?? 'create'}`) so switching between "Add" and editing
 * a different row remounts it instead of needing a reset()-on-prop-change
 * effect.
 */
export function ContactDialog({ open, onOpenChange, contact }: ContactDialogProps) {
  const isEdit = !!contact;
  const createMutation = useCreateContact();
  const updateMutation = useUpdateContact();

  const form = useForm<ContactFormValues>({
    // The two schemas differ only in whether `email` is present (edit mode
    // hides that field entirely) — cast needed because Resolver<T> is
    // contravariant in T and CreateContactValues's required `email` doesn't
    // structurally match ContactFormValues's optional one.
    resolver: zodResolver(isEdit ? editContactSchema : createContactSchema) as never,
    defaultValues: isEdit
      ? {
          firstName: contact?.firstName ?? '',
          lastName: contact?.lastName ?? '',
          status: contact?.status ?? 'subscribed',
        }
      : {
          email: '',
          firstName: '',
          lastName: '',
          status: 'subscribed',
        },
  });

  const onSubmit = async (values: ContactFormValues) => {
    const payload = {
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      status: values.status,
    };
    if (isEdit && contact) {
      await updateMutation.mutateAsync({ id: contact.id, ...payload });
    } else {
      await createMutation.mutateAsync({ ...payload, email: values.email! });
    }
    onOpenChange(false);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add contact'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {!isEdit && (
            <FormField
              label="Email"
              type="email"
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="First name"
              error={form.formState.errors.firstName?.message}
              {...form.register('firstName')}
            />
            <FormField
              label="Last name"
              error={form.formState.errors.lastName?.message}
              {...form.register('lastName')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {isEdit && contact && <ContactTagsSection contact={contact} />}

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

/**
 * Tags editor — local optimistic state seeded from `contact.tags` (the list
 * query includes tags, see contacts.api.ts). Add/remove mutations don't
 * invalidate the contacts list on every call (would refetch mid-edit); the
 * page invalidates once when the dialog closes instead.
 */
function ContactTagsSection({ contact }: { contact: Contact }) {
  const [tags, setTags] = useState<ContactTag[]>(contact.tags ?? []);
  const [newTagName, setNewTagName] = useState('');

  const tagsQuery = useTags();
  const addTag = useAddContactTag();
  const removeTag = useRemoveContactTag();
  const createTagMutation = useCreateTag();

  const availableTags = (tagsQuery.data ?? []).filter(
    (t) => !tags.some((existing) => existing.id === t.id),
  );

  const handleAddExisting = (tagId: string) => {
    const tag = availableTags.find((t) => t.id === tagId);
    if (!tag) return;
    addTag.mutate(
      { contactId: contact.id, tagId },
      { onSuccess: () => setTags((prev) => [...prev, tag]) },
    );
  };

  const handleRemove = (tagId: string) => {
    removeTag.mutate(
      { contactId: contact.id, tagId },
      { onSuccess: () => setTags((prev) => prev.filter((t) => t.id !== tagId)) },
    );
  };

  const handleCreateAndAdd = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await createTagMutation.mutateAsync(name);
      await addTag.mutateAsync({ contactId: contact.id, tagId: tag.id });
      setTags((prev) => [...prev, tag]);
      setNewTagName('');
    } catch {
      // toast already shown by the mutation's onError
    }
  };

  return (
    <div className="space-y-2">
      <Label>Tags</Label>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <p className="text-xs text-muted-foreground">No tags yet.</p>
        )}
        {tags.map((tag) => (
          <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
            {tag.name}
            <button
              type="button"
              onClick={() => handleRemove(tag.id)}
              className="rounded-full p-0.5 hover:bg-background/50"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        {availableTags.length > 0 && (
          <Select value="" onValueChange={handleAddExisting}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Add existing tag…" />
            </SelectTrigger>
            <SelectContent>
              {availableTags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          placeholder="New tag name"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCreateAndAdd();
            }
          }}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCreateAndAdd}
          disabled={!newTagName.trim() || createTagMutation.isPending}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
