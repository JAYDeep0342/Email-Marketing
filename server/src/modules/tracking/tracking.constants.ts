/**
 * Constants + the provider-agnostic normalized event shape.
 */

// Allowed event types — MUST match the events_type_check DB constraint exactly.
export const EVENT_TYPES = [
  'sent',
  'delivered',
  'open',
  'click',
  'bounce',
  'complaint',
  'unsubscribe',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Every provider's raw webhook is parsed down to a list of these. The core
 * TrackingEventsService only ever sees NormalizedEvent — it never knows or
 * cares which provider produced it.
 */
export interface NormalizedEvent {
  type: EventType;
  // Correlation: at least one of these must be present.
  providerMessageId?: string; // SES messageId etc. -> email_jobs.provider_message_id
  emailJobId?: string; // direct id (simulator path)
  // Optional context
  url?: string; // for click
  userAgent?: string;
  ipAddress?: string;
  occurredAt?: Date;
  meta?: Record<string, unknown>;
}

// Reconciliation runs on its OWN queue (BullMQ allows only one WorkerHost per
// queue, so it cannot share the sending-maintenance queue with the poller).
export const RECONCILE_QUEUE = 'sending-reconcile';

// Reconciliation: a campaign stuck in 'sending' with no active jobs for longer
// than this is considered orphaned and gets finalized.
export const ORPHAN_SENDING_MINUTES = 15;

// Repeatable reconciliation cadence.
export const RECONCILE_EVERY_MS = 5 * 60_000; // 5 min
export const RECONCILE_JOB_ID = 'sending-reconciliation';
export const RECONCILE_JOB_NAME = 'reconcile-sending';
