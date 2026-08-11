// import { Module } from '@nestjs/common';
// import { APP_GUARD } from '@nestjs/core';
// import { ConfigModule } from '@nestjs/config';
// import { ClsModule } from 'nestjs-cls';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import configuration from './config/configuration';
// import { envValidationSchema } from './config/env.validation';
// import { PrismaModule } from './prisma/prisma.module';
// import { AuthModule } from './modules/auth/auth.module';
// import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

// import { UsersModule } from './modules/users/users.module';
// import { TenantsModule } from './modules/tenants/tenants.module';
// import { RolesModule } from './modules/roles/roles.module';

// import { ContactsModule } from './modules/contacts/contacts.module';
// import { ListsModule } from './modules/lists/lists.module';
// import { SegmentsModule } from './modules/segments/segments.module';

// import { TemplatesModule } from './modules/template/templates.module';
// import { CampaignsModule } from './modules/campaigns/campaigns.module';

// @Module({
//   imports: [
//     ConfigModule.forRoot({
//       isGlobal: true,
//       load: [configuration],
//       validationSchema: envValidationSchema,
//       validationOptions: { abortEarly: false },
//     }),
//     ClsModule.forRoot({ global: true, middleware: { mount: true } }),
//     PrismaModule,
//     AuthModule,
//     UsersModule,
//     TenantsModule,
//     RolesModule,
//     ContactsModule,
//     ListsModule,
//     SegmentsModule,
//     TemplatesModule,
//     CampaignsModule,
//   ],
//   controllers: [AppController],
//   providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
// })
// export class AppModule {}
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClsModule } from 'nestjs-cls';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { RolesModule } from './modules/roles/roles.module';

import { ContactsModule } from './modules/contacts/contacts.module';
import { ListsModule } from './modules/lists/lists.module';
import { SegmentsModule } from './modules/segments/segments.module';

import { TemplatesModule } from './modules/template/templates.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { SendingModule } from './modules/sending/sending.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { AutomationsModule } from './modules/automations/automations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    // Decoupled domain events (triggers) — global so any module can emit.
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    RolesModule,
    ContactsModule,
    ListsModule,
    SegmentsModule,
    TemplatesModule,
    CampaignsModule,
    SendingModule,
    TrackingModule,
    AutomationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
