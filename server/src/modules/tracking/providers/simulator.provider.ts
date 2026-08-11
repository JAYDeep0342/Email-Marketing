import { Injectable } from '@nestjs/common';
import { MailProvider } from './mail-provider.interface';
import { EVENT_TYPES, EventType, NormalizedEvent } from '../tracking.constants';

/**
 * Dev-only provider. Lets us exercise the ENTIRE tracking pipeline
 * (delivered/bounce/complaint/open/click -> stats + auto-suppress) for FREE,
 * with no ESP account, by POSTing a tiny JSON body:
 *
 *   POST /api/webhooks/email/simulator
 *   { "events": [ { "emailJobId": "<uuid>", "type": "delivered" },
 *                 { "emailJobId": "<uuid>", "type": "bounce" } ] }
 *
 * verify() is gated: it refuses in production unless SIMULATOR_ENABLED=true, so
 * this can never become an unauthenticated event-injection hole in prod.
 */
@Injectable()
export class SimulatorProvider implements MailProvider {
  readonly name = 'simulator';

  async verify(): Promise<boolean> {
    const isProd = process.env.NODE_ENV === 'production';
    const enabled = process.env.SIMULATOR_ENABLED === 'true';
    return !isProd || enabled;
  }

  async parse(rawBody: string): Promise<NormalizedEvent[]> {
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return [];
    }
    const list: any[] = Array.isArray(body?.events) ? body.events : [];
    const out: NormalizedEvent[] = [];
    for (const e of list) {
      if (!e || !EVENT_TYPES.includes(e.type)) continue;
      if (!e.emailJobId && !e.providerMessageId) continue;
      out.push({
        type: e.type as EventType,
        emailJobId: e.emailJobId,
        providerMessageId: e.providerMessageId,
        url: e.url,
        userAgent: e.userAgent,
        ipAddress: e.ipAddress,
        occurredAt: e.occurredAt ? new Date(e.occurredAt) : undefined,
        meta: e.meta,
      });
    }
    return out;
  }
}