import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { DatabaseService } from './database/database.service.js';

/** TRUST_PROXY=1 (one proxy hop), true, false, or a list of proxy IPs — see Express "trust proxy". */
function trustProxySetting(value: string | undefined): boolean | number | string | undefined {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const database = app.get(DatabaseService);

  // Behind Nginx / Caddy / Hostinger the client IP arrives in X-Forwarded-For. Without this,
  // every visitor shares the proxy's IP and the rate limiter blocks them all together.
  const trustProxy = trustProxySetting(config.get<string>('TRUST_PROXY'));
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Resume photos, canvas pages and HTML exports can be several MB.
  app.useBodyParser('json', { limit: '30mb' });
  app.useBodyParser('urlencoded', { limit: '30mb', extended: true });

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

  // The database connects in the background (DatabaseService). Until it is ready, API calls get a
  // clear 503 (after CORS, so the app can read it) instead of failing inside a controller.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (database.isReady || req.path === '/health' || req.path === '/health/') return next();
    const { state } = database.status();
    res.setHeader('Retry-After', state === 'misconfigured' ? '300' : '5');
    res.status(503).json({
      statusCode: 503,
      error: 'Service Unavailable',
      message:
        state === 'misconfigured'
          ? 'The database is not configured on the server. See /api/health.'
          : 'The database is starting up. Please retry in a few seconds.',
    });
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
    // Build files with a content hash in the name never change; everything else (ngsw.json, the
    // service worker, manifest, payment QR) is revalidated so a new deploy shows up at once.
    const hashed = /[-.][A-Z0-9]{8}\.(?:m?js|css|woff2?|ttf|svg|png|jpe?g|webp|avif)$/;
    app.useStaticAssets(staticRoot, {
      index: false,
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', hashed.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    expressApp.get(/^(?!\/api(\/|$)).*/, (_req: unknown, res: { sendFile: (p: string) => void }) => {
      res.sendFile(join(staticRoot, 'index.html'));
    });
  }

  const rawPort = config.get<string>('PORT') ?? process.env.PORT ?? '3000';
  const port = /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort;
  await app.listen(port);
  Logger.log(`API ready on ${typeof port === 'number' ? `http://localhost:${port}/api` : port}`, 'Bootstrap');
}

// No top-level await: some hosts (e.g. Passenger-based Node.js hosting) load the entry file with require().
bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error), 'Bootstrap');
  process.exit(1);
});
