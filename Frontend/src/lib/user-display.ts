import type { AuthUser } from '@/types/api';

/**
 * Small helpers to turn an AuthUser into UI-ready display strings.
 *
 * Kept as plain functions (not a hook) so they're callable from anywhere
 * — Avatar fallback, welcome header, sign-out toast, etc.
 */

/**
 * 1-2 character avatar initials. Prefers first-initial + last-initial;
 * falls back to first two chars of the email local-part.
 */
export function getUserInitials(user: AuthUser | null | undefined): string {
  if (!user) return '?';
  const first = (user.firstName ?? '').trim();
  const last = (user.lastName ?? '').trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
  }
  const local = user.email.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '?';
}

/**
 * Best-available human name for greetings. Falls back through:
 * firstName -> firstName+lastName -> email local-part -> "there".
 */
export function getDisplayName(user: AuthUser | null | undefined): string {
  if (!user) return 'there';
  const first = (user.firstName ?? '').trim();
  const last = (user.lastName ?? '').trim();
  if (first) return last ? `${first} ${last}` : first;
  const local = user.email.split('@')[0];
  return local || 'there';
}

/** Just the short first-name (or fallback), for compact spots like "Welcome, X". */
export function getShortName(user: AuthUser | null | undefined): string {
  if (!user) return 'there';
  const first = (user.firstName ?? '').trim();
  if (first) return first;
  return user.email.split('@')[0] || 'there';
}
