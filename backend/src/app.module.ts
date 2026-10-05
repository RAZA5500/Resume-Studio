import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module.js';
import { AtsModule } from './ats/ats.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { CheckoutModule } from './checkout/checkout.module.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { DatabaseModule } from './database/database.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { ExportModule } from './export/export.module.js';
import { ExtractionModule } from './extraction/extraction.module.js';
import { HealthController } from './health.controller.js';
import { ResumesModule } from './resumes/resumes.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    BillingModule,
    CheckoutModule,
    UsersModule,
    AuthModule,
    TemplatesModule,
    ExtractionModule,
    ExportModule,
    ResumesModule,
    AiModule,
    AtsModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
