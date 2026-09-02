import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTags } from '@/features/contacts/use-contacts';
import { useListsList } from '@/features/lists/use-lists';
import { useTemplatesList } from '@/features/templates/use-templates';
import { AutomationStep, STEP_TYPES, StepType } from './automations.api';
import { useSetAutomationSteps } from './use-automations';

const STEP_LABEL: Record<StepType, string> = {
  send_email: 'Send email',
  wait: 'Wait',
  add_tag: 'Add tag',
  remove_tag: 'Remove tag',
  add_to_list: 'Add to list',
  condition: 'Condition (has tag?)',
  exit: 'Exit',
};

function blankConfig(stepType: StepType): Record<string, any> {
  switch (stepType) {
    case 'wait':
      return { minutes: 0, hours: 0, days: 1 };
    case 'condition':
      return { kind: 'has_tag', tagId: '', onFalse: 'exit' };
    default:
      return {};
  }
}

interface StepsBuilderProps {
  automationId: string;
  initialSteps: AutomationStep[];
}

/**
 * Ordered step list editor. Steps are plain local state (not react-hook-form
 * — a heterogeneous, reorderable list doesn't fit that model well) saved in
 * one shot via PUT /automations/:id/steps, which replaces the whole list.
 * stepOrder is just the array index at save time — reordering is Up/Down
 * buttons, no drag-and-drop library pulled in for this.
 */
export function StepsBuilder({ automationId, initialSteps }: StepsBuilderProps) {
  const [steps, setSteps] = useState<AutomationStep[]>(
    initialSteps.length
      ? initialSteps.map((s) => ({ ...s, config: s.config ?? {} }))
      : [],
  );
  const setStepsMutation = useSetAutomationSteps(automationId);

  const update = (index: number, patch: Partial<AutomationStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const updateConfig = (index: number, patch: Record<string, any>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, config: { ...s.config, ...patch } } : s)),
    );
  };
  const move = (index: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const remove = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index));
  const add = () =>
    setSteps((prev) => [
      ...prev,
      { stepOrder: prev.length, stepType: 'send_email', config: blankConfig('send_email') },
    ]);

  const handleSave = () => {
    setStepsMutation.mutate(steps.map((s, i) => ({ ...s, stepOrder: i })));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-medium">Steps</CardTitle>
        <Button onClick={handleSave} disabled={setStepsMutation.isPending}>
          {setStepsMutation.isPending ? 'Saving…' : 'Save Steps'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">No steps yet — add one below.</p>
        )}
        {steps.map((step, index) => (
          <StepRow
            key={index}
            index={index}
            step={step}
            isFirst={index === 0}
            isLast={index === steps.length - 1}
            onTypeChange={(stepType) => update(index, { stepType, config: blankConfig(stepType) })}
            onConfigChange={(patch) => updateConfig(index, patch)}
            onMove={(dir) => move(index, dir)}
            onRemove={() => remove(index)}
          />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add step
        </Button>
      </CardContent>
    </Card>
  );
}

function StepRow({
  index,
  step,
  isFirst,
  isLast,
  onTypeChange,
  onConfigChange,
  onMove,
  onRemove,
}: {
  index: number;
  step: AutomationStep;
  isFirst: boolean;
  isLast: boolean;
  onTypeChange: (stepType: StepType) => void;
  onConfigChange: (patch: Record<string, any>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{index + 1}</Badge>
          <Select value={step.stepType} onValueChange={(v) => onTypeChange(v as StepType)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEP_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {STEP_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onMove(-1)}
            disabled={isFirst}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onMove(1)}
            disabled={isLast}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <StepConfigFields step={step} onConfigChange={onConfigChange} />
    </div>
  );
}

function StepConfigFields({
  step,
  onConfigChange,
}: {
  step: AutomationStep;
  onConfigChange: (patch: Record<string, any>) => void;
}) {
  const templatesQuery = useTemplatesList({ page: 1, limit: 100 });
  const listsQuery = useListsList({ page: 1, limit: 100 });
  const tagsQuery = useTags();
  const cfg = step.config ?? {};

  switch (step.stepType) {
    case 'send_email':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select
              value={cfg.templateId ?? ''}
              onValueChange={(v) => onConfigChange({ templateId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent>
                {templatesQuery.rows.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              value={cfg.subject ?? ''}
              onChange={(e) => onConfigChange({ subject: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>From name (optional)</Label>
            <Input
              value={cfg.fromName ?? ''}
              onChange={(e) => onConfigChange({ fromName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>From email (optional)</Label>
            <Input
              value={cfg.fromEmail ?? ''}
              onChange={(e) => onConfigChange({ fromEmail: e.target.value })}
            />
          </div>
          <p className="col-span-2 text-xs text-muted-foreground">
            A from name/email (or a verified signature set elsewhere) is required before
            this automation can be activated.
          </p>
        </div>
      );

    case 'wait':
      return (
        <div className="grid grid-cols-3 gap-3">
          {(['days', 'hours', 'minutes'] as const).map((unit) => (
            <div key={unit} className="space-y-1.5">
              <Label className="capitalize">{unit}</Label>
              <Input
                type="number"
                min={0}
                value={cfg[unit] ?? 0}
                onChange={(e) => onConfigChange({ [unit]: Number(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
      );

    case 'add_tag':
    case 'remove_tag':
      return (
        <div className="space-y-1.5">
          <Label>Tag</Label>
          <Select value={cfg.tagId ?? ''} onValueChange={(v) => onConfigChange({ tagId: v })}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Pick a tag" />
            </SelectTrigger>
            <SelectContent>
              {(tagsQuery.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'add_to_list':
      return (
        <div className="space-y-1.5">
          <Label>List</Label>
          <Select value={cfg.listId ?? ''} onValueChange={(v) => onConfigChange({ listId: v })}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Pick a list" />
            </SelectTrigger>
            <SelectContent>
              {listsQuery.rows.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'condition':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Has tag</Label>
            <Select value={cfg.tagId ?? ''} onValueChange={(v) => onConfigChange({ tagId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a tag" />
              </SelectTrigger>
              <SelectContent>
                {(tagsQuery.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>If false</Label>
            <Select
              value={cfg.onFalse ?? 'exit'}
              onValueChange={(v) => onConfigChange({ onFalse: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exit">Exit the automation</SelectItem>
                <SelectItem value="continue">Continue anyway</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'exit':
      return <p className="text-xs text-muted-foreground">Ends the run here. No config.</p>;

    default:
      return null;
  }
}
