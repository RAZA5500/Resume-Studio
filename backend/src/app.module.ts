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
        let url = config.get<string>('DATABASE_URL');
        if (url && (url.includes('[') || url.includes('YOUR-PASSWORD') || url.includes('YOUR-REGION') || url.includes('YOUR-'))) {
          url = undefined;
        }
        if (url) {
          try {
            new URL(url);
          } catch {
            url = undefined;
          }
        }

        const supabaseUrl = config.get<string>('SUPABASE_URL');
        let supabaseProject = '';
        if (supabaseUrl) {
          const match = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
          if (match) supabaseProject = match[1];
        }

        let host = config.get<string>('DATABASE_HOST');
        let port = Number(config.get<string>('DATABASE_PORT', '5432'));
        let username = config.get<string>('DATABASE_USER');
        const password = config.get<string>('DATABASE_PASSWORD', '');
        let database = config.get<string>('DATABASE_NAME');

        // Auto-configure Supabase pooler if Supabase URL is present and host is missing/localhost
        if (supabaseProject && (!host || host === 'localhost' || host === '127.0.0.1')) {
          const region = config.get<string>('SUPABASE_REGION', 'ap-southeast-1');
          host = `aws-0-${region}.pooler.supabase.com`;
          port = 5432;
          username = `postgres.${supabaseProject}`;
          database = 'postgres';
        } else {
          host = host || 'localhost';
          username = username || 'postgres';
          database = database || 'postgres';
        }

        const sslSetting = config.get<string>('DATABASE_SSL');
        const isRemote = (!!url && !url.includes('localhost') && !url.includes('127.0.0.1')) ||
          (!!host && host !== 'localhost' && host !== '127.0.0.1');
        const enableSsl = sslSetting !== undefined ? sslSetting === 'true' : isRemote;
        const ssl = enableSsl ? { rejectUnauthorized: false } : false;

        return {
          type: 'postgres' as const,
          manualInitialization: true, // Non-blocking startup: never crash the web server
          ...(url
            ? { url }
            : {
                host,
                port,
                username,
                password,
                database,
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
          // Auto-creates tables in development/sync mode.
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
