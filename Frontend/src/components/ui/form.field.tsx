import { forwardRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * FormField — the label + input + error trio, wrapped.
 *
 * Not a shadcn primitive — a small in-house helper that keeps forms
 * visually consistent and cuts boilerplate. Every field on every auth
 * screen uses this. Bigger apps might reach for shadcn's own `form.tsx`
 * (which integrates react-hook-form via Context); this is deliberately
 * simpler because our forms are small and flat.
 *
 * `error` is a plain string (typically `errors.<field>?.message` from
 * react-hook-form). Passing it triggers the red border + message row.
 */

interface Props extends InputProps {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, Props>(
  ({ label, error, id, className, ...inputProps }, ref) => {
    // Fall back to a stable id derived from the label so htmlFor works
    // even when the caller doesn't pass an explicit id.
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
          {...inputProps}
        />
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
FormField.displayName = 'FormField';
