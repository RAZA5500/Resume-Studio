import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { setLastDatabaseError } from './health.controller.js';
import { TemplatesService } from './templates/templates.service.js';

/** TRUST_PROXY=1 (one proxy hop), true, false, or a list of proxy IPs — see Express "trust proxy". */
function trustProxySetting(value: string | undefined): boolean | number | string | undefined {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function initDatabaseInBackground(app: NestExpressApplication, dataSource: DataSource, config: ConfigService) {
  let attempt = 0;
  const maxAttempts = 60; // Retry up to 5 minutes with 5s delay
  while (!dataSource.isInitialized && attempt < maxAttempts) {
    attempt++;
    try {
      const host = config.get<string>('DATABASE_HOST') || 'Supabase pooler';
      Logger.log(`Connecting to database at ${host} (attempt ${attempt}/${maxAttempts})...`, 'Database');
      await dataSource.initialize();
      setLastDatabaseError(null);
      Logger.log('Supabase PostgreSQL database connection established! Tables synchronized.', 'Database');
      
      try {
        const templatesService = app.get(TemplatesService);
        await templatesService.seedCatalog();
      } catch (seedErr) {
        Logger.warn(`Catalog seed notice: ${(seedErr as Error).message}`, 'Database');
      }
      return;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setLastDatabaseError(errorMsg);
      Logger.error(`Database connection attempt ${attempt} failed: ${errorMsg}`, 'Database');
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const dataSource = app.get(DataSource);

  // Behind Nginx / Caddy / Hostinger the client IP arrives in X-Forwarded-For. Without this,
  // every visitor shares the proxy's IP and the rate limiter blocks them all together.
  const trustProxy = trustProxySetting(config.get<string>('TRUST_PROXY'));
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Resume photos, canvas pages and HTML exports can be several MB.
  app.useBodyParser('json', { limit: '30mb' });
  app.useBodyParser('urlencoded', { limit: '30mb', extended: true });

  // Graceful degradation for API calls while database is connecting
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/api', (req: { path: string }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    if (req.path === '/health' || req.path === '/health/' || dataSource.isInitialized) {
      return next();
    }
    return res.status(503).json({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Database is connecting to Supabase. Please retry in a few seconds.',
    });
  });

  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  // The Android app (Capacitor) serves its pages from https://localhost, so that origin is always allowed.
  const origins = (config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200').split(',').map((o) => o.trim());
  app.enableCors({
    origin: [...origins, 'https://localhost'],
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  // When running on unified hosts (e.g. Hostinger), serve compiled Angular frontend if present
  const candidates = [
    resolve(process.cwd(), '../dist/frontend/browser'),
    resolve(process.cwd(), 'dist/frontend/browser'),
    resolve(process.cwd(), 'public_html'),
    resolve(process.cwd(), '../public_html'),
  ];
  const staticRoot = candidates.find((dir) => existsSync(dir) && existsSync(join(dir, 'index.html')));
  if (staticRoot) {
    Logger.log(`Serving frontend from: ${staticRoot}`, 'Bootstrap');
    app.useStaticAssets(staticRoot, {
      index: false,
      maxAge: '1y',
    });
    expressApp.get(/^(?!\/api(\/|$)).*/, (_req: unknown, res: { sendFile: (p: string) => void }) => {
      res.sendFile(join(staticRoot, 'index.html'));
    });
  }

  const rawPort = config.get<string>('PORT') ?? process.env.PORT ?? '3000';
  const port = /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort;
  await app.listen(port);
  Logger.log(`API ready on ${typeof port === 'number' ? `http://localhost:${port}/api` : port}`, 'Bootstrap');

  // Initiate database connection in background so startup is never blocked
  initDatabaseInBackground(app, dataSource, config).catch((err) => {
    Logger.error(`Database background initialization error: ${err.message}`, 'Bootstrap');
  });
}

// No top-level await: some hosts (e.g. Passenger-based Node.js hosting) load the entry file with require().
bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error), 'Bootstrap');
  process.exit(1);
});
