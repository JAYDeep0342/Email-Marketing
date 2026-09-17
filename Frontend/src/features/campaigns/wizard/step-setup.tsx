import { useRef } from 'react';
import { FormField } from '@/components/ui/form.field';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSignatures } from '@/features/campaigns/use-campaigns';
import type { SetupValues } from './wizard-types';

const NONE = '__none__';
const MERGE_TAGS = [
  { label: 'First name', tag: '{{firstName}}' },
  { label: 'Last name', tag: '{{lastName}}' },
  { label: 'Email', tag: '{{email}}' },
];

interface StepSetupProps {
  value: SetupValues;
  onChange: (value: SetupValues) => void;
  errors?: Partial<Record<'name' | 'subject', string>>;
}

export function StepSetup({ value, onChange, errors }: StepSetupProps) {
  const signaturesQuery = useSignatures();
  const subjectRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof SetupValues>(key: K, v: SetupValues[K]) =>
    onChange({ ...value, [key]: v });

  const insertMergeTag = (tag: string) => {
    const el = subjectRef.current;
    if (!el) {
      set('subject', value.subject + tag);
      return;
    }
    const start = el.selectionStart ?? value.subject.length;
    const end = el.selectionEnd ?? value.subject.length;
    const next = value.subject.slice(0, start) + tag + value.subject.slice(end);
    set('subject', next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const selectedSignature = value.signature;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Campaign setup</h2>
        <p className="text-sm text-muted-foreground">
          Name, subject line, and who this email comes from.
        </p>
      </div>

      <FormField
        label="Campaign name"
        value={value.name}
        onChange={(e) => set('name', e.target.value)}
        error={errors?.name}
      />

      <div className="space-y-1.5">
        <FormField
          ref={subjectRef}
          label="Subject"
          value={value.subject}
          onChange={(e) => set('subject', e.target.value)}
          error={errors?.subject}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Insert:</span>
          {MERGE_TAGS.map((m) => (
            <Button
              key={m.tag}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => insertMergeTag(m.tag)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <FormField
        label="Preheader (optional)"
        value={value.preheader}
        onChange={(e) => set('preheader', e.target.value)}
      />

      <div className="space-y-1.5">
        <Label>Sender</Label>
        <Select
          value={selectedSignature?.id || NONE}
          onValueChange={(v) => {
            if (v === NONE) {
              set('signature', null);
              return;
            }
            const sig = (signaturesQuery.data ?? []).find((s) => s.id === v);
            if (sig) set('signature', { id: sig.id, name: sig.name, isVerified: sig.isVerified });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="No signature" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Use from name / email below instead</SelectItem>
            {(signaturesQuery.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {!s.isVerified && '(unverified)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedSignature && (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="From name"
            value={value.fromName}
            onChange={(e) => set('fromName', e.target.value)}
          />
          <FormField
            label="From email"
            value={value.fromEmail}
            onChange={(e) => set('fromEmail', e.target.value)}
          />
        </div>
      )}

      {selectedSignature && !selectedSignature.isVerified && (
        <p className="text-xs text-destructive">
          This signature isn't verified yet — verify it before this campaign can be scheduled.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Pick a verified signature, or set a from name/email directly — one of the two is
        required before this campaign can be scheduled.
      </p>
    </div>
  );
}
