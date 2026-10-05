import type { ConfigService } from '@nestjs/config';

/**
 * Public address of the site: the first FRONTEND_URL origin (same default as CORS in main.ts).
 * Payment gateways and Google / Apple sign-in send the browser back here, so in production it
 * must be the real https address.
 */
export function siteUrlFrom(config: ConfigService): string {
  const first = (config.get<string>('FRONTEND_URL') ?? '').split(',')[0]?.trim();
  return (first || 'http://localhost:4200').replace(/\/+$/, '');
}
