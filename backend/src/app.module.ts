import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module.js';
import { AtsModule } from './ats/ats.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        const sslSetting = config.get<string>('DATABASE_SSL');
        const isRemote = !!url && !url.includes('localhost') && !url.includes('127.0.0.1');
        const enableSsl = sslSetting !== undefined ? sslSetting === 'true' : isRemote;
        const ssl = enableSsl ? { rejectUnauthorized: false } : false;

        return {
          type: 'postgres' as const,
          ...(url
            ? { url }
            : {
                host: config.get<string>('DATABASE_HOST', 'localhost'),
                port: Number(config.get<string>('DATABASE_PORT', '5432')),
                username: config.get<string>('DATABASE_USER', 'resumestudio'),
                password: config.get<string>('DATABASE_PASSWORD', 'resumestudio_secret'),
                database: config.get<string>('DATABASE_NAME', 'resumestudio'),
              }),
          ssl,
          extra: enableSsl
            ? {
                ssl: { rejectUnauthorized: false },
                max: Number(config.get<string>('DATABASE_MAX_CONNECTIONS', '10')),
                connectionTimeoutMillis: 10_000,
              }
            : undefined,
          autoLoadEntities: true,
          // Auto-creates tables in development. Set DB_SYNC=false and use migrations in production.
          synchronize: config.get<string>('DB_SYNC', 'true') === 'true',
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    BillingModule,
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
