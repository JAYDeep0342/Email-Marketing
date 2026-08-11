import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { MailProvider } from './providers/mail-provider.interface';
import { SesProvider } from './providers/ses.provider';
import { SimulatorProvider } from './providers/simulator.provider';
import { TrackingEventsService } from './tracking-events.service';

/**
 * Public inbound webhooks from ESPs. NOT the same as the tenant-facing
 * `webhooks` table (that's outbound). @Public() opens these past the global
 * JwtAuthGuard; each provider verifies authenticity itself.
 *
 * ⚠️ RAW BODY: signature schemes sign the exact bytes. This controller relies on
 * the raw string body. See README — you must enable rawBody in main.ts
 * (NestFactory.create(AppModule, { rawBody: true })) and read req.rawBody, OR
 * accept that @Body() re-serialization can break SES signature checks. For the
 * simulator (no signature) @Body() is fine.
 */
@Controller('webhooks/email')
export class WebhookController {
  private readonly providers: Record<string, MailProvider>;

  constructor(
    private readonly events: TrackingEventsService,
    ses: SesProvider,
    simulator: SimulatorProvider,
  ) {
    this.providers = { [ses.name]: ses, [simulator.name]: simulator };
  }

  @Public()
  @Post(':provider')
  @HttpCode(200)
  async ingest(
    @Param('provider') providerName: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    const provider = this.providers[providerName];
    if (!provider) throw new BadRequestException('Unknown provider');

    // Prefer a raw body if the app exposes one; fall back to re-stringify.
    const raw =
      typeof body === 'string' ? body : JSON.stringify(body ?? {});

    const ok = await provider.verify(raw, headers);
    if (!ok) throw new ForbiddenException('Webhook verification failed');

    // SNS-style handshake (subscription confirmation) short-circuits.
    if (provider.handleHandshake) {
      let parsed: any = {};
      try {
        parsed = typeof body === 'string' ? JSON.parse(body) : body;
      } catch {
        /* ignore */
      }
      const consumed = await provider.handleHandshake(parsed);
      if (consumed) return { message: 'handshake ok' };
    }

    const normalized = await provider.parse(raw);
    for (const ev of normalized) {
      await this.events.apply(ev);
    }
    return { message: 'ok', processed: normalized.length };
  }
}
