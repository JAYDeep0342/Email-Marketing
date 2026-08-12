import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

// Native JSON.stringify (Express's res.json()) can't serialize BigInt, and
// this schema has several BigInt columns (Subscription.creditsRemaining,
// UsageRecord.quantity, ...) that Prisma returns as-is. Without this, any
// endpoint that ever returns one of those rows directly 500s on
// serialization. No built-in BigInt.prototype.toJSON exists, so this can't
// clobber intentional behavior.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Razorpay webhook needs the RAW request body to verify its HMAC signature
  // (see BillingWebhookController / INTEGRATION.md). Must be registered
  // BEFORE any JSON body parsing so Nest's default parser never touches it.
  // Path includes the /api prefix set below.
  app.use(
    '/api/billing/webhooks/razorpay',
    bodyParser.raw({ type: '*/*', limit: '1mb' }),
  );

  // Global validation — DTOs are validated + stripped of unknown fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not in the DTO
      forbidNonWhitelisted: true, // throw if unknown properties are sent
      transform: true, // auto-convert payloads to DTO instances
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global response wrapper { success, data, meta }
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  // Global error formatter { success, error }
  app.useGlobalFilters(new AllExceptionsFilter());

  // API prefix — all routes become /api/...
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}/api`);
}
bootstrap();
