import { useEffect, useRef } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useResolveRecipients } from '@/features/campaigns/use-campaigns';
import type { ScheduleChoice, SetupValues, TargetSelection, TemplateDraft } from './wizard-types';

interface StepConfirmProps {
  campaignId: string;
  target: TargetSelection | null;
  setup: SetupValues;
  template: TemplateDraft;
  schedule: ScheduleChoice;
  onLaunch: () => void;
  isLaunching: boolean;
}

interface ChecklistItem {
  label: string;
  ready: boolean;
  detail: string;
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{item.label}</p>
        <p className="text-xs text-muted-foreground">{item.detail}</p>
      </div>
      {item.ready ? (
        <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15">
          <Check className="h-3 w-3" /> Ready
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1 text-muted-foreground">
          <CircleAlert className="h-3 w-3" /> Needs attention
        </Badge>
      )}
    </div>
  );
}

export function StepConfirm({
  campaignId,
  target,
  setup,
  template,
  schedule,
  onLaunch,
  isLaunching,
}: StepConfirmProps) {
  const resolveMutation = useResolveRecipients(campaignId);
  const hasResolvedOnce = useRef(false);

  useEffect(() => {
    if (hasResolvedOnce.current || !campaignId) return;
    hasResolvedOnce.current = true;
    resolveMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const resolvedTotal = resolveMutation.data?.total ?? null;
  const templateName =
    template.mode === 'existing' ? template.existing?.name : template.customName || null;
  const hasSender = !!setup.signature || (!!setup.fromName && !!setup.fromEmail);
  const senderVerifiedOk = setup.signature ? setup.signature.isVerified : hasSender;
  const scheduleReady = schedule.mode === 'now' || (schedule.mode === 'later' && !!schedule.when);

  const items: ChecklistItem[] = [
    {
      label: 'Recipients',
      ready: resolvedTotal !== null && resolvedTotal > 0,
      detail: resolveMutation.isPending
        ? 'Resolving audience…'
        : resolvedTotal !== null
          ? `${resolvedTotal.toLocaleString()} eligible recipient${resolvedTotal === 1 ? '' : 's'} after unsubscribes/suppression`
          : target
            ? `Targeting ${target.name}`
            : 'No list or segment selected',
    },
    {
      label: 'Subject',
      ready: !!setup.subject.trim(),
      detail: setup.subject || 'No subject set',
    },
    {
      label: 'Sender',
      ready: senderVerifiedOk,
      detail: setup.signature
        ? `${setup.signature.name}${setup.signature.isVerified ? '' : ' — not verified yet'}`
        : hasSender
          ? `${setup.fromName} <${setup.fromEmail}>`
          : 'No sender set',
    },
    {
      label: 'Template',
      ready: !!templateName,
      detail: templateName ?? 'No template selected',
    },
    {
      label: 'Schedule',
      ready: scheduleReady,
      detail:
        schedule.mode === 'now'
          ? 'Sending now (within ~1 minute)'
          : schedule.when
            ? `Scheduled for ${new Date(schedule.when).toLocaleString()}`
            : 'No date/time picked',
    },
  ];

  const allReady = items.every((i) => i.ready);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Review and launch</h2>
        <p className="text-sm text-muted-foreground">
          Double-check everything below, then launch the campaign.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium">{setup.name}</span>
          <span className="text-muted-foreground">Audience</span>
          <span className="font-medium">{target ? target.name : '—'}</span>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map((item) => (
          <ChecklistRow key={item.label} item={item} />
        ))}
      </div>

      <div className={cn('flex justify-end pt-2')}>
        <Button type="button" size="lg" disabled={!allReady || isLaunching} onClick={onLaunch}>
          {isLaunching ? 'Launching…' : 'Launch campaign'}
        </Button>
      </div>
    </div>
  );
}
