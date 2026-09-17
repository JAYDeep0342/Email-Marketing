import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { normalizeAxiosError } from '@/lib/api';
import {
  useCreateCampaign,
  useScheduleCampaign,
  useUpdateCampaign,
} from '@/features/campaigns/use-campaigns';
import { useCreateTemplate } from '@/features/templates/use-templates';
import { StepRecipients } from '@/features/campaigns/wizard/step-recipients';
import { StepSetup } from '@/features/campaigns/wizard/step-setup';
import { StepTemplate } from '@/features/campaigns/wizard/step-template';
import { StepSchedule } from '@/features/campaigns/wizard/step-schedule';
import { StepConfirm } from '@/features/campaigns/wizard/step-confirm';
import { WizardStepper } from '@/features/campaigns/wizard/wizard-stepper';
import {
  EMPTY_SETUP,
  EMPTY_TEMPLATE_DRAFT,
  ScheduleChoice,
  TargetSelection,
} from '@/features/campaigns/wizard/wizard-types';

const STEPS = [
  { id: 1, label: 'Recipients' },
  { id: 2, label: 'Setup' },
  { id: 3, label: 'Template' },
  { id: 4, label: 'Schedule' },
  { id: 5, label: 'Confirm' },
];

/**
 * Create-early-then-PATCH wizard: the draft campaign is created at the end
 * of Step 2 (the earliest point CreateCampaignDto's required name+subject
 * exist), and every step after that PATCHes the same row. See the
 * investigation report this replaces the old CampaignFormDialog-only create
 * flow with — the dialog itself is untouched and still used for editing an
 * existing campaign from the detail page.
 */
export default function CampaignWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [setup, setSetup] = useState(EMPTY_SETUP);
  const [setupErrors, setSetupErrors] = useState<Partial<Record<'name' | 'subject', string>>>({});
  const [template, setTemplate] = useState(EMPTY_TEMPLATE_DRAFT);
  const [schedule, setSchedule] = useState<ScheduleChoice>({ mode: 'now' });

  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign(campaignId ?? '');
  const createTemplateMutation = useCreateTemplate();
  const scheduleMutation = useScheduleCampaign(campaignId ?? '');

  const buildBasePayload = () => ({
    name: setup.name,
    subject: setup.subject,
    preheader: setup.preheader || undefined,
    fromName: setup.signature ? undefined : setup.fromName || undefined,
    fromEmail: setup.signature ? undefined : setup.fromEmail || undefined,
    signatureId: setup.signature?.id,
    listId: target?.type === 'list' ? target.id : undefined,
    segmentId: target?.type === 'segment' ? target.id : undefined,
  });

  // Step 2 -> 3: create the draft on first arrival, PATCH on every return visit.
  const handleSetupNext = async () => {
    const errors: Partial<Record<'name' | 'subject', string>> = {};
    if (!setup.name.trim()) errors.name = 'Name is required';
    if (!setup.subject.trim()) errors.subject = 'Subject is required';
    setSetupErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      if (!campaignId) {
        const created = await createMutation.mutateAsync(buildBasePayload());
        setCampaignId(created.id);
      } else {
        await updateMutation.mutateAsync(buildBasePayload());
      }
      setStep(3);
    } catch {
      // toasted by the mutation's onError
    }
  };

  // Step 3 -> 4: turn pasted HTML into a real Template row if needed, then PATCH templateId.
  const handleTemplateNext = async () => {
    if (!campaignId) return;
    try {
      let templateId: string | undefined;
      if (template.mode === 'custom' && template.customHtml.trim()) {
        const created = await createTemplateMutation.mutateAsync({
          name: template.customName.trim() || `${setup.name} (custom HTML)`,
          renderedHtml: template.customHtml,
        });
        setTemplate((t) => ({ ...t, existing: { id: created.id, name: created.name, html: created.renderedHtml } }));
        templateId = created.id;
      } else if (template.mode === 'existing' && template.existing) {
        templateId = template.existing.id;
      }
      await updateMutation.mutateAsync({ templateId });
      setStep(4);
    } catch {
      // toasted by the mutation's onError
    }
  };

  const handleScheduleNext = () => {
    if (schedule.mode === 'later' && !schedule.when) return;
    setStep(5);
  };

  const handleLaunch = async () => {
    if (!campaignId) return;
    const when =
      schedule.mode === 'now'
        ? new Date(Date.now() + 90_000).toISOString()
        : new Date(schedule.when).toISOString();
    try {
      await scheduleMutation.mutateAsync(when);
      navigate(`/app/campaigns/${campaignId}`);
    } catch (err) {
      toast.error(normalizeAxiosError(err).message);
    }
  };

  const canLeaveRecipients = !!target?.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/campaigns')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New campaign</h1>
      </div>

      <Card>
        <CardContent className="p-6">
          <WizardStepper steps={STEPS} current={step} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {step === 1 && <StepRecipients value={target} onChange={setTarget} />}
          {step === 2 && (
            <StepSetup value={setup} onChange={setSetup} errors={setupErrors} />
          )}
          {step === 3 && <StepTemplate value={template} onChange={setTemplate} />}
          {step === 4 && <StepSchedule value={schedule} onChange={setSchedule} />}
          {step === 5 && campaignId && (
            <StepConfirm
              campaignId={campaignId}
              target={target}
              setup={setup}
              template={template}
              schedule={schedule}
              onLaunch={handleLaunch}
              isLaunching={scheduleMutation.isPending}
            />
          )}
        </CardContent>
      </Card>

      {step < 5 && (
        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
          >
            Back
          </Button>
          {step === 1 && (
            <Button type="button" disabled={!canLeaveRecipients} onClick={() => setStep(2)}>
              Next
            </Button>
          )}
          {step === 2 && (
            <Button
              type="button"
              onClick={handleSetupNext}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Next'}
            </Button>
          )}
          {step === 3 && (
            <Button
              type="button"
              onClick={handleTemplateNext}
              disabled={createTemplateMutation.isPending || updateMutation.isPending}
            >
              {createTemplateMutation.isPending || updateMutation.isPending
                ? 'Saving…'
                : 'Next'}
            </Button>
          )}
          {step === 4 && (
            <Button
              type="button"
              onClick={handleScheduleNext}
              disabled={schedule.mode === 'later' && !schedule.when}
            >
              Next
            </Button>
          )}
        </div>
      )}
      {step === 5 && (
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={() => setStep(4)}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
