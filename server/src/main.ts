import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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