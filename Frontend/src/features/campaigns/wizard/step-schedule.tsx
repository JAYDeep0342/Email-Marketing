import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ScheduleChoice } from './wizard-types';

interface StepScheduleProps {
  value: ScheduleChoice;
  onChange: (value: ScheduleChoice) => void;
}

// Backend requires scheduledAt strictly in the future (assertSendable) — the
// wizard's own "send now" maps to now+90s at Launch time, so floor the
// "later" picker just past that so the two paths never overlap oddly.
const minLocal = new Date(Date.now() + 2 * 60_000).toISOString().slice(0, 16);

export function StepSchedule({ value, onChange }: StepScheduleProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">When should this send?</h2>
        <p className="text-sm text-muted-foreground">
          The dispatcher polls every 60 seconds and sends once a campaign is due.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange({ mode: 'now' })}
          className={cn(
            'rounded-md border p-4 text-left transition-colors',
            value.mode === 'now' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
          )}
        >
          <p className="font-medium">Send now</p>
          <p className="text-xs text-muted-foreground">Goes out within the next minute or so.</p>
        </button>
        <button
          type="button"
          onClick={() => onChange({ mode: 'later', when: value.mode === 'later' ? value.when : '' })}
          className={cn(
            'rounded-md border p-4 text-left transition-colors',
            value.mode === 'later' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
          )}
        >
          <p className="font-medium">Schedule for later</p>
          <p className="text-xs text-muted-foreground">Pick a specific date and time.</p>
        </button>
      </div>

      {value.mode === 'later' && (
        <Card>
          <CardContent className="space-y-1.5 p-4">
            <Label htmlFor="scheduledAt">Send at</Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              min={minLocal}
              value={value.when}
              onChange={(e) => onChange({ mode: 'later', when: e.target.value })}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
