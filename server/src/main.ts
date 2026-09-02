import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
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
  const config = app.get(ConfigService);

  // CORS (BUG #5) — allowed origins come from CORS_ORIGINS (comma-separated;
  // see env.validation.ts / configuration.ts), defaulting to the Vite dev
  // origin. Frontend auth is Bearer-token based, not cookie-based, but
  // credentials:true + explicit allowedHeaders keeps Authorization passing
  // through consistently.
  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Security headers (BUG #5). Two defaults deliberately overridden, both
  // because they'd break a verified-working public route otherwise:
  //  - contentSecurityPolicy: helmet's default CSP blocks the inline
  //    scripts Swagger UI's HTML page needs at /docs.
  //  - crossOriginResourcePolicy: helmet's default 'same-origin' would let
  //    browsers refuse to load the open-tracking pixel (GET /api/t/o/:token)
  //    when embedded from an arbitrary webmail/email-client origin, which is
  //    the entire point of that route.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

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

  // Swagger docs — auto-generated from controllers + DTOs (see @nestjs/swagger
  // plugin in nest-cli.json, which infers request/response shapes from
  // class-validator decorators without needing @ApiProperty everywhere).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EmailMarketing API')
    .setDescription(
      'Auto-generated API reference for every controller currently registered in the app.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}/api`);
  console.log(`📚 API docs available at http://localhost:${port}/docs`);
}
bootstrap();
