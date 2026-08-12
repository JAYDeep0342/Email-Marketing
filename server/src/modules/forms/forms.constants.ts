// Event channel name — same one AutomationTriggerListener already subscribes to
// (Step 15). We just emit new triggerType values on it; no new listener needed.
export const AUTOMATION_TRIGGER_EVENT = 'automation.trigger';

// New trigger types introduced by Forms. Kept as string literals so
// automations.constants.ts stays the single source of truth for its own
// allow-list — Forms only owns the emit side.
export const TRIGGER_CONTACT_CREATED = 'contact_created';
export const TRIGGER_FORM_SUBMITTED = 'form_submitted';

// Mirrors the Prisma FormType enum, kept local so DTOs stay independent of
// the generated client (same convention as CAMPAIGN_STATUS / SENDING_PROVIDER).
// Must match `enum FormType` in schema.prisma exactly (embedded/popup/hosted) —
// any value here that isn't a real enum label passes DTO validation but then
// fails at the Prisma/DB layer.
export const FORM_TYPES = ['embedded', 'popup', 'hosted'] as const;
export type FormTypeValue = (typeof FORM_TYPES)[number];