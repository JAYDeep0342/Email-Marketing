import { NormalizedEvent } from '../tracking.constants';

/**
 * The seam that keeps us provider-agnostic. Adding a new ESP (SES, Resend,
 * SendGrid...) means writing ONE class that implements this — nothing in the
 * core tracking pipeline changes.
 */
export interface MailProvider {
  /** stable key used in the webhook route: POST /webhooks/email/:provider */
  readonly name: string;

  /**
   * Verify the request is genuinely from the provider. Return true/false.
   * `headers` and the raw string body are passed so signature schemes that sign
   * the raw payload work. Some providers (SNS) also require a handshake — see
   * handleHandshake.
   */
  verify(rawBody: string, headers: Record<string, string>): Promise<boolean>;

  /**
   * Some providers (AWS SNS) send a SubscriptionConfirmation that must be
   * acknowledged before they deliver events. If this returns true, the message
   * was a handshake and there are no events to process.
   */
  handleHandshake?(parsed: any): Promise<boolean>;

  /** Parse a verified webhook body into zero or more normalized events. */
  parse(rawBody: string): Promise<NormalizedEvent[]>;
}