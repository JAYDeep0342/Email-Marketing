/**
 * Central constants for the Automations engine.
 */

// --- Trigger types (TEXT in DB, validated in DTO) ---
export const TRIGGER_TYPES = [
  'contact_created',
  'contact_added_to_list',
  'email_opened',
  'email_clicked',
  'form_submitted',
  'manual',
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

// --- Step types (TEXT in DB, validated in DTO) ---
export const STEP_TYPES = [
  'send_email',
  'wait',
  'add_tag',
  'remove_tag',
  'add_to_list',
  'condition',
  'exit',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

// --- BullMQ ---
export const AUTOMATION_QUEUE = 'automation';
export const JOB_POLL_RUNS = 'poll-automation-runs';
export const POLL_JOB_ID = 'automation-run-poller';
export const POLL_EVERY_MS = 30_000; // 30s
export const MAX_RUNS_PER_TICK = 100;

// A run is "claimed" by pushing next_run_at into the future (a lease). If the
// executor crashes mid-step, the lease expires and the run is re-picked — no
// run gets permanently stuck.
export const RUN_LEASE_MS = 5 * 60_000; // 5 min

// Safety cap: how many consecutive immediate steps one tick will run for a
// single run before yielding (prevents a pathological all-immediate loop from
// hogging the worker). A 'wait' or 'exit'/'complete' ends the pass earlier.
export const MAX_STEPS_PER_TICK = 50;

// --- Domain event bus (EventEmitter2) ---
// Existing modules emit this; the automation listener maps it to enrollment.
export const AUTOMATION_TRIGGER_EVENT = 'automation.trigger';

export interface AutomationTriggerPayload {
  tenantId: string;
  triggerType: TriggerType;
  contactId: string;
  // trigger-specific context, e.g. { listId } for contact_added_to_list
  context?: Record<string, unknown>;
}