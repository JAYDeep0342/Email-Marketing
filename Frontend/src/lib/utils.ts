import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The `cn` helper — merges Tailwind classes intelligently.
 *
 * Every shadcn/ui component imports this. Don't rename or move without
 * updating the import path in components.json (`utils` alias).
 *
 *   cn('px-4', condition && 'bg-red-500', 'px-2')
 *
 * `clsx` handles conditional/array/object class inputs; `twMerge` then
 * resolves conflicts so the later class wins (px-2 beats px-4 above).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
