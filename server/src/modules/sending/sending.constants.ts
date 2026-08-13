/**
 * Central constants for the Sending Engine.
 * Keeping queue/job names in one place avoids typos across producer + worker.
 */

// --- Queues ---
export const EMAIL_QUEUE = 'email';
export const MAINTENANCE_QUEUE = 'sending-maintenance';

// --- Job names ---
export const JOB_SEND_EMAIL = 'send-email';
export const JOB_POLL_SCHEDULED = 'poll-scheduled-campaigns';

// --- Tunables ---
// How often the scheduler polls for due campaigns (ms).
export const POLL_EVERY_MS = 60_000;

// BullMQ retry policy for a single email send.
export const EMAIL_JOB_ATTEMPTS = 3;
export const EMAIL_JOB_BACKOFF_MS = 30_000; // exponential base

// A stable jobId for the repeatable poll so it is never duplicated.
export const POLL_JOB_ID = 'scheduled-campaign-poller';

// Max campaigns claimed per poll tick (keeps each tick bounded).
export const MAX_CAMPAIGNS_PER_TICK = 50;

// email_jobs insert batch size (mirrors campaign_recipients CHUNK).
export const EMAIL_JOB_CHUNK = 5000;

// The email job payload carried through BullMQ.
export interface SendEmailJobData {
  emailJobId: string;
  tenantId: string;
}