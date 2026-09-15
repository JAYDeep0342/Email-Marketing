import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Progress — plain-div bar, same convention as the rest of this folder
 * (Textarea, Table, ...): no Radix primitive installed for this one, and a
 * filled-track bar doesn't need one. `value`/`max` drive width + ARIA.
 */
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  indicatorClassName?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, indicatorClassName, ...props }, ref) => {
    const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
        {...props}
      >
        <div
          className={cn('h-full rounded-full bg-primary transition-all', indicatorClassName)}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';

export { Progress };
