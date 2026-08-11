import { Injectable, Logger } from '@nestjs/common';
import { createVerify } from 'crypto';
import { MailProvider } from './mail-provider.interface';
import { EventType, NormalizedEvent } from '../tracking.constants';

/**
 * Amazon SES via SNS.
 *
 * SES publishes bounce/complaint/delivery notifications to an SNS topic, which
 * POSTs JSON to our endpoint. Two message shapes:
 *   - SubscriptionConfirmation: must be acknowledged (we fetch SubscribeURL).
 *   - Notification: the SES event, JSON-encoded inside `Message`.
 *
 * ⚠️ SIGNATURE VERIFICATION: implemented per AWS's documented canonical string,
 * but MUST be validated against real SNS traffic in staging before production
 * trust. Until then, keep SES behind staging. The simulator path is what we
 * test locally for free.
 */
@Injectable()
export class SesProvider implements MailProvider {
  readonly name = 'ses';
  private readonly logger = new Logger(SesProvider.name);

  async verify(rawBody: string): Promise<boolean> {
    let msg: any;
    try {
      msg = JSON.parse(rawBody);
    } catch {
      return false;
    }
    try {
      return await this.verifySnsSignature(msg);
    } catch (e) {
      this.logger.warn(`SNS signature verify failed: ${(e as Error).message}`);
      return false;
    }
  }

  async handleHandshake(parsed: any): Promise<boolean> {
    if (parsed?.Type === 'SubscriptionConfirmation' && parsed.SubscribeURL) {
      // Only fetch AWS-hosted confirmation URLs.
      if (!this.isAwsUrl(parsed.SubscribeURL)) {
        this.logger.warn('Refusing non-AWS SubscribeURL');
        return true;
      }
      try {
        await fetch(parsed.SubscribeURL);
        this.logger.log('SNS subscription confirmed');
      } catch (e) {
        this.logger.error(`SNS confirm fetch failed: ${(e as Error).message}`);
      }
      return true; // handshake consumed, no events
    }
    return false;
  }

  async parse(rawBody: string): Promise<NormalizedEvent[]> {
    const outer = JSON.parse(rawBody);
    if (outer?.Type !== 'Notification' || !outer.Message) return [];

    const ses = JSON.parse(outer.Message);
    const notifType: string = ses.eventType || ses.notificationType || '';
    const messageId: string | undefined = ses?.mail?.messageId;
    if (!messageId) return [];

    const map: Record<string, EventType> = {
      Delivery: 'delivered',
      Bounce: 'bounce',
      Complaint: 'complaint',
      Open: 'open',
      Click: 'click',
      Send: 'sent',
    };
    const type = map[notifType];
    if (!type) return [];

    // Only HARD bounces should suppress; soft bounces are transient. We carry
    // the bounce sub-type in meta so the core can decide.
    const meta: Record<string, unknown> = {};
    if (type === 'bounce') {
      meta.bounceType = ses?.bounce?.bounceType; // 'Permanent' | 'Transient' | ...
    }

    return [
      {
        type,
        providerMessageId: messageId,
        url: type === 'click' ? ses?.click?.link : undefined,
        userAgent:
          ses?.open?.userAgent || ses?.click?.userAgent || undefined,
        ipAddress: ses?.open?.ipAddress || ses?.click?.ipAddress || undefined,
        occurredAt: ses?.mail?.timestamp
          ? new Date(ses.mail.timestamp)
          : undefined,
        meta,
      },
    ];
  }

  // ---- SNS signature verification ----

  private isAwsUrl(u: string): boolean {
    try {
      const url = new URL(u);
      return (
        url.protocol === 'https:' &&
        /(^|\.)amazonaws\.com$/.test(url.hostname)
      );
    } catch {
      return false;
    }
  }

  private async verifySnsSignature(msg: any): Promise<boolean> {
    if (!msg.SignatureVersion || !msg.Signature || !msg.SigningCertURL) {
      return false;
    }
    if (!this.isAwsUrl(msg.SigningCertURL)) return false;

    const stringToSign = this.buildStringToSign(msg);
    if (stringToSign === null) return false;

    const certPem = await this.fetchCert(msg.SigningCertURL);
    const algo = msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
    const verifier = createVerify(algo);
    verifier.update(stringToSign, 'utf8');
    return verifier.verify(certPem, msg.Signature, 'base64');
  }

  /** AWS canonical string: sorted key\nvalue\n pairs for a fixed field set. */
  private buildStringToSign(msg: any): string | null {
    const fieldsByType: Record<string, string[]> = {
      Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
      SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
      UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
    };
    const fields = fieldsByType[msg.Type];
    if (!fields) return null;
    let s = '';
    for (const f of fields) {
      if (msg[f] === undefined || msg[f] === null) continue; // Subject is optional
      s += `${f}\n${msg[f]}\n`;
    }
    return s;
  }

  private async fetchCert(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cert fetch ${res.status}`);
    return res.text();
  }
}