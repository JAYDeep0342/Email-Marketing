// Event channel name — same one AutomationTriggerListener already subscribes to
// (Step 15). We just emit the existing 'contact_added_to_list' triggerType on
// it from this call site; no new listener needed.
export const AUTOMATION_TRIGGER_EVENT = 'automation.trigger';

// Kept as a string literal so automations.constants.ts stays the single
// source of truth for its own allow-list — Lists only owns the emit side.
// Same convention as forms.constants.ts / contacts.constants.ts.
export const TRIGGER_CONTACT_ADDED_TO_LIST = 'contact_added_to_list';
