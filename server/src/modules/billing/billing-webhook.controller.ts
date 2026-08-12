import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RazorpayService } from './razorpay.service';
import { BillingWebhookService } from './billing-webhook.service';

/**
 * Razorpay webhook receiver.
 *
 * CRITICAL â raw body:
 *   Signature verification requires the EXACT bytes Razorpay sent. Nest's
 *   default json parser destroys them. main.ts MUST attach a raw-body copy
 *   for /billing/webhooks/razorpay before the json parser runs:
 *
 *     app.use('/billing/webhooks/razorpay', bodyParser.raw({ type: '* /*' }));
 *
 *   (see INTEGRATION.md). Without that, all webhooks silently fail signature
 *   check and every event is dropped.
 *
 * Response policy: ALWAYS 200. Razorpay retries 4xx/5xx indefinitely; bad
 * events get logged and acknowledged rather than triggering a retry storm.
 */
@Controller('billing/webhooks')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly razorpay: RazorpayService,
    private readonly webhook: BillingWebhookService,
  ) {}

  @Public()
  @Post('razorpay')
  @HttpCode(200)
  async razorpayWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    // req.body here is a Buffer thanks to bodyParser.raw() in main.ts.
    const rawBody =
      req.body instanceof Buffer
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body); // fallback â logs will show if we hit this

    if (!signature) {
      this.logger.warn('Razorpay webhook missing signature header');
      return { ok: true };
    }

    const valid = await this.razorpay.verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      this.logger.warn('Razorpay webhook signature INVALID â dropping event');
      // Still 200 â 4xx would trigger retries, which won't fix a bad signature.
      // A determined attacker gets nothing (event never processed).
      return { ok: true };
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      this.logger.warn('Razorpay webhook body is not valid JSON');
      return { ok: true };
    }

    return this.webhook.handle(event);
  }
}
