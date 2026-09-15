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

/**
 * "2h ago" / "3d ago" (past) or "in 2h" / "in 3d" (future) relative time. No
 * date library in this project (checked package.json) — the ranges here
 * cover everything the dashboard's recent-campaigns list and the campaigns
 * list's scheduled-date column need, so a hand-rolled version is simpler
 * than adding a dependency for it.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then; // positive = past, negative = future
  const isFuture = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return isFuture ? 'in a moment' : 'just now';
  if (abs < 30 * day) {
    const unit = abs < hour ? `${Math.floor(abs / minute)}m` : abs < day ? `${Math.floor(abs / hour)}h` : `${Math.floor(abs / day)}d`;
    return isFuture ? `in ${unit}` : `${unit} ago`;
  }
  return new Date(iso).toLocaleDateString();
}
