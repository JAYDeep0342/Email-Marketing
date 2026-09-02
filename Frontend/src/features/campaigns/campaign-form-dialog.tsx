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
import { useSegmentsList } from '@/features/segments/use-segments';
import { useTemplatesList } from '@/features/templates/use-templates';
import { CampaignDetail } from './campaigns.api';
import { campaignFormSchema, CampaignFormValues } from './campaigns.schemas';
import { useCreateCampaign, useSignatures, useUpdateCampaign } from './use-campaigns';

const NONE = '__none__';

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  campaign?: CampaignDetail | null;
  /** Called with the new campaign's id right after a successful create. */
  onCreated?: (id: string) => void;
}

/**
 * Create/Edit campaign dialog. Covers every CreateCampaignDto/UpdateCampaignDto
 * field so "create" already includes template + sender + audience — the
 * detail page's own edit re-opens this same dialog with `campaign` set.
 *
 * Sender is either a Signature OR a plain fromName/fromEmail pair — the
 * backend only enforces "one or the other" at schedule time (assertSendable),
 * so both are shown as independent optional fields here rather than a toggle.
 */
export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
  onCreated,
}: CampaignFormDialogProps) {
  const isEdit = !!campaign;
  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign(campaign?.id ?? '');

  const templatesQuery = useTemplatesList({ page: 1, limit: 100 });
  const listsQuery = useListsList({ page: 1, limit: 100 });
  const segmentsQuery = useSegmentsList({ page: 1, limit: 100 });
  const signaturesQuery = useSignatures();

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: campaign?.name ?? '',
      subject: campaign?.subject ?? '',
      preheader: campaign?.preheader ?? '',
      templateId: campaign?.template?.id ?? '',
      signatureId: campaign?.signature?.id ?? '',
      fromName: campaign?.fromName ?? '',
      fromEmail: campaign?.fromEmail ?? '',
      listId: campaign?.list?.id ?? '',
      segmentId: campaign?.segment?.id ?? '',
    },
  });

  const onSubmit = async (values: CampaignFormValues) => {
    const payload = {
      name: values.name,
      subject: values.subject,
      preheader: values.preheader || undefined,
      templateId: values.templateId || undefined,
      signatureId: values.signatureId || undefined,
      fromName: values.fromName || undefined,
      fromEmail: values.fromEmail || undefined,
      listId: values.listId || undefined,
      segmentId: values.segmentId || undefined,
    };
    if (isEdit && campaign) {
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
          <DialogTitle>{isEdit ? 'Edit campaign' : 'Create campaign'}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
          noValidate
        >
          <FormField
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <FormField
            label="Subject"
            error={form.formState.errors.subject?.message}
            {...form.register('subject')}
          />
          <FormField
            label="Preheader (optional)"
            error={form.formState.errors.preheader?.message}
            {...form.register('preheader')}
          />

          <div className="space-y-1.5">
            <Label>Template</Label>
            <Controller
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No template</SelectItem>
                    {templatesQuery.rows.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Signature</Label>
              <Controller
                control={form.control}
                name="signatureId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No signature" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No signature</SelectItem>
                      {(signaturesQuery.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} {!s.isVerified && '(unverified)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div />
            <FormField
              label="From name (optional)"
              error={form.formState.errors.fromName?.message}
              {...form.register('fromName')}
            />
            <FormField
              label="From email (optional)"
              error={form.formState.errors.fromEmail?.message}
              {...form.register('fromEmail')}
            />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Pick a verified signature, or set a from name/email directly — one of the two
            is required before this campaign can be scheduled.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Target list</Label>
              <Controller
                control={form.control}
                name="listId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No list" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No list</SelectItem>
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
            <div className="space-y-1.5">
              <Label>Target segment</Label>
              <Controller
                control={form.control}
                name="segmentId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No segment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No segment</SelectItem>
                      {segmentsQuery.rows.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
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
