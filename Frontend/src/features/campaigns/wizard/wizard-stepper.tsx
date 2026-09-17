import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WizardStepDef {
  id: number;
  label: string;
}

interface WizardStepperProps {
  steps: WizardStepDef[];
  current: number;
}

/**
 * Horizontal numbered-circle stepper. Plain divs, existing tokens only
 * (primary/border/muted-foreground) — no new component library, matches the
 * rest of components/ui's "hand-rolled primitive" convention.
 */
export function WizardStepper({ steps, current }: WizardStepperProps) {
  return (
    <div className="flex items-start">
      {steps.map((s, i) => (
        <div key={s.id} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                s.id < current && 'border-primary bg-primary text-primary-foreground',
                s.id === current && 'border-primary text-primary',
                s.id > current && 'border-border text-muted-foreground',
              )}
            >
              {s.id < current ? <Check className="h-4 w-4" /> : s.id}
            </div>
            <span
              className={cn(
                'whitespace-nowrap text-xs font-medium',
                s.id <= current ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'mx-2 mb-5 h-0.5 flex-1 transition-colors',
                s.id < current ? 'bg-primary' : 'bg-border',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
