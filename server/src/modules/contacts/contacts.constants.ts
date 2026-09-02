// Event channel name — same one AutomationTriggerListener already subscribes to
// (Step 15). We just emit the existing 'contact_created' triggerType on it from
// this second call site; no new listener needed.
export const AUTOMATION_TRIGGER_EVENT = 'automation.trigger';

// Kept as a string literal so automations.constants.ts stays the single
// source of truth for its own allow-list — Contacts only owns the emit side.
// Same convention as forms.constants.ts's TRIGGER_CONTACT_CREATED.
export const TRIGGER_CONTACT_CREATED = 'contact_created';
