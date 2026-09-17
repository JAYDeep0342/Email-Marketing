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
import { AdminCurrency, AdminPlan, BILLING_PERIODS } from './admin-plans.api';
import { planFormSchema, PlanFormValues } from './admin-plans.schemas';
import { useCreatePlan, useUpdatePlan } from './use-admin-plans';

const NONE = '__none__';

const LIMIT_FIELDS = [
  ['maxContacts', 'Max contacts'],
  ['maxLists', 'Max lists'],
  ['maxEmailsMonth', 'Max emails / month'],
  ['maxEmailsDay', 'Max emails / day'],
  ['maxUsers', 'Max users'],
  ['maxCampaigns', 'Max campaigns'],
  ['maxAutomations', 'Max automations'],
] as const;

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  plan?: AdminPlan | null;
  /** Distinct currencies collected from the already-loaded plans list — see
   * admin-plans.api.ts's note: there's no GET /currencies endpoint. */
  currencies: AdminCurrency[];
}

export function PlanDialog({ open, onOpenChange, plan, currencies }: PlanDialogProps) {
  const isEdit = !!plan;
  const createMutation = useCreatePlan();
  const updateMutation = useUpdatePlan();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: plan?.name ?? '',
      code: plan?.code ?? '',
      price: plan ? (plan.priceCents / 100).toFixed(2) : '',
      currencyId: plan?.currencyId ?? '',
      billingPeriod: plan?.billingPeriod ?? 'monthly',
      planType: plan?.planType ?? 'general',
      isActive: plan ? (plan.isActive ? 'true' : 'false') : 'true',
      maxContacts: plan?.planLimit?.maxContacts?.toString() ?? '',
      maxLists: plan?.planLimit?.maxLists?.toString() ?? '',
      maxEmailsMonth: plan?.planLimit?.maxEmailsMonth?.toString() ?? '',
      maxEmailsDay: plan?.planLimit?.maxEmailsDay?.toString() ?? '',
      maxUsers: plan?.planLimit?.maxUsers?.toString() ?? '',
      maxCampaigns: plan?.planLimit?.maxCampaigns?.toString() ?? '',
      maxAutomations: plan?.planLimit?.maxAutomations?.toString() ?? '',
      dedicatedIp: plan?.planLimit?.dedicatedIp ? 'true' : 'false',
      aiEnabled: plan?.planLimit?.aiEnabled ? 'true' : 'false',
    },
  });

  const onSubmit = async (values: PlanFormValues) => {
    const toLimit = (v: string | undefined) => (!v ? null : Number(v));
    const shared = {
      name: values.name,
      priceCents: Math.round(parseFloat(values.price) * 100),
      currencyId: values.currencyId || undefined,
      billingPeriod: values.billingPeriod,
      planType: values.planType,
      isActive: values.isActive === 'true',
      maxContacts: toLimit(values.maxContacts),
      maxLists: toLimit(values.maxLists),
      maxEmailsMonth: toLimit(values.maxEmailsMonth),
      maxEmailsDay: toLimit(values.maxEmailsDay),
      maxUsers: toLimit(values.maxUsers),
      maxCampaigns: toLimit(values.maxCampaigns),
      maxAutomations: toLimit(values.maxAutomations),
      dedicatedIp: values.dedicatedIp === 'true',
      aiEnabled: values.aiEnabled === 'true',
    };

    if (isEdit && plan) {
      await updateMutation.mutateAsync({ id: plan.id, ...shared });
    } else {
      await createMutation.mutateAsync({ ...shared, code: values.code });
    }
    onOpenChange(false);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit plan' : 'Create plan'}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
          noValidate
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Name"
              error={form.formState.errors.name?.message}
              {...form.register('name')}
            />
            {isEdit ? (
              <div className="space-y-1.5">
                <Label>Code</Label>
                <p className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {plan?.code}
                </p>
              </div>
            ) : (
              <FormField
                label="Code"
                placeholder="e.g. starter-2026"
                error={form.formState.errors.code?.message}
                {...form.register('code')}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField
              label="Price"
              inputMode="decimal"
              error={form.formState.errors.price?.message}
              {...form.register('price')}
            />
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Controller
                control={form.control}
                name="currencyId"
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
                      {currencies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} ({c.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing period</Label>
              <Controller
                control={form.control}
                name="billingPeriod"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_PERIODS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Plan type"
              error={form.formState.errors.planType?.message}
              {...form.register('planType')}
            />
            <div className="space-y-1.5">
              <Label>Status</Label>
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
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <Label>Limits (leave blank for unlimited)</Label>
            <div className="grid grid-cols-3 gap-3">
              {LIMIT_FIELDS.map(([field, label]) => (
                <FormField
                  key={field}
                  label={label}
                  type="number"
                  min={0}
                  {...form.register(field)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dedicated IP</Label>
              <Controller
                control={form.control}
                name="dedicatedIp"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>AI features</Label>
              <Controller
                control={form.control}
                name="aiEnabled"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
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
