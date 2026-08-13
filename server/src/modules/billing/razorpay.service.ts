import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret } from '../../common/utils/crypto.util';

/**
 * Thin wrapper around Razorpay's API. Not marked @Global â imported into
 * BillingModule only.
 *
 * Credentials are stored in payment_gateways.encrypted_credentials as JSON:
 *   { keyId: "...", keySecret: "...", webhookSecret: "..." }
 * ...encrypted with the same helper the SendingServer secrets use.
 *
 * We use the REST API directly (fetch) rather than the razorpay npm package
 * so we don't add a heavy dep for the four calls we need. Every call goes
 * through Basic Auth with keyId:keySecret.
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  private cachedCreds: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // Loads active Razorpay gateway creds on demand. Throws if none configured
  // so callers get a clean 503 instead of a runtime null-deref.
  private async getCreds() {
    if (this.cachedCreds) return this.cachedCreds;

    const gateway = await this.prisma.paymentGateway.findFirst({
      where: { provider: 'razorpay', isActive: true },
    });
    if (!gateway) {
      throw new ServiceUnavailableException(
        'Razorpay is not configured. Add a payment_gateways row with provider=razorpay.',
      );
    }

    try {
      const creds = JSON.parse(decryptSecret(gateway.encryptedCredentials));
      if (!creds.keyId || !creds.keySecret || !creds.webhookSecret) {
        throw new Error('missing keyId / keySecret / webhookSecret');
      }
      this.cachedCreds = creds;
      return creds;
    } catch (e) {
      this.logger.error(`Razorpay creds decrypt failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Razorpay credentials invalid');
    }
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: any,
  ): Promise<T> {
    const creds = await this.getCreds();
    const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      this.logger.warn(
        `Razorpay ${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`,
      );
      // Wrap all upstream errors as 400 to the caller â Razorpay's own error
      // codes are opaque and we don't want to proxy their 4xx/5xx status through.
      throw new BadRequestException(
        json?.error?.description ?? 'Razorpay request failed',
      );
    }
    return json as T;
  }

  /**
   * Create a Razorpay Subscription. Requires a Razorpay Plan ID (from their
   * dashboard) â our Plan record stores it in Plan.planType or a settings
   * blob. For v1 we look it up via a side-channel: the platform admin sets
   * platform_settings with key='razorpay.plan_map' -> { [ourPlanId]: rzpPlanId }.
   * Kept out of the Plan schema so we don't need a migration.
   */
  async createSubscription(input: {
    razorpayPlanId: string;
    totalCount: number; // number of billing cycles; use a large number for "until cancelled"
    customerNotify?: boolean;
    notes?: Record<string, string>;
  }) {
    return this.call<{
      id: string;
      status: string;
      short_url: string;
      current_start: number | null;
      current_end: number | null;
    }>('POST', '/subscriptions', {
      plan_id: input.razorpayPlanId,
      total_count: input.totalCount,
      customer_notify: input.customerNotify ? 1 : 0,
      notes: input.notes ?? {},
    });
  }

  async cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true) {
    return this.call<{ id: string; status: string }>(
      'POST',
      `/subscriptions/${subscriptionId}/cancel`,
      { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 },
    );
  }

  async fetchSubscription(subscriptionId: string) {
    return this.call<any>('GET', `/subscriptions/${subscriptionId}`);
  }

  /**
   * Verify a Razorpay webhook signature. Razorpay signs the RAW request body
   * with HMAC-SHA256 using the webhook secret; the header is `x-razorpay-signature`.
   *
   * CRITICAL: the raw body string is what's signed. If you re-serialize a
   * parsed JSON body the signature won't match â the controller MUST use the
   * raw body (see main.ts note in INTEGRATION.md).
   */
  async verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
    const creds = await this.getCreds();
    const expected = crypto
      .createHmac('sha256', creds.webhookSecret)
      .update(rawBody)
      .digest('hex');
    // Constant-time compare â Buffer.from is safe because both are hex-encoded
    // and equal-length when the signature is well-formed.
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  // Called when platform admin rotates keys via the payment-gateways admin API.
  invalidateCache() {
    this.cachedCreds = null;
  }
}
