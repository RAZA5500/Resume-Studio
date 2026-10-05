import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { map, type Observable } from 'rxjs';
import { sessionLifetimeMs } from './refresh-tokens.service.js';

export const REFRESH_COOKIE = 'rs_refresh';
/** The cookie only goes along with sign-in, refresh and sign-out requests. */
const COOKIE_PATH = '/api/auth';
/**
 * Pages of the Android app (Capacitor). Its web view does not keep cookies for another site, so the
 * app gets the refresh token in the response body and keeps it itself. Browsers set Origin, and
 * scripts cannot change it, so a website cannot ask for the token this way.
 */
const APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

type SameSite = 'lax' | 'strict' | 'none';

export function isAppRequest(request: Request): boolean {
  return APP_ORIGINS.has(request.headers.origin ?? '');
}

/** The refresh token of this request: the cookie on the web, the body field in the Android app. */
export function refreshTokenFrom(request: Request, fromBody: string | undefined): string | undefined {
  if (isAppRequest(request)) return fromBody;
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * Writes and clears the refresh-token cookie: httpOnly (page scripts cannot read it), Secure over
 * HTTPS, SameSite=Lax by default. AUTH_COOKIE_SAMESITE=none is for an API on another site than
 * the app (API_URL); browsers then require HTTPS.
 */
@Injectable()
export class SessionCookies {
  private readonly sameSite: SameSite;
  private readonly maxAge: number;

  constructor(config: ConfigService) {
    const sameSite = config.get<string>('AUTH_COOKIE_SAMESITE')?.trim().toLowerCase() || 'lax';
    if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') {
      this.sameSite = sameSite;
    } else {
      this.sameSite = 'lax';
      new Logger('Auth').warn(`AUTH_COOKIE_SAMESITE must be lax, strict or none (got "${sameSite}") — using lax.`);
    }
    this.maxAge = sessionLifetimeMs(config);
  }

  set(request: Request, response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, { ...this.options(request), maxAge: this.maxAge });
  }

  clear(request: Request, response: Response): void {
    if (!isAppRequest(request)) response.clearCookie(REFRESH_COOKIE, this.options(request));
  }

  private options(request: Request): CookieOptions {
    const https = request.secure || String(request.headers['x-forwarded-proto'] ?? '').startsWith('https');
    return { httpOnly: true, secure: https || this.sameSite === 'none', sameSite: this.sameSite, path: COOKIE_PATH };
  }
}

/**
 * For routes that start or renew a session: moves `refreshToken` from the response body into the
 * cookie (the Android app keeps it in the body).
 */
@Injectable()
export class SessionCookieInterceptor implements NestInterceptor {
  constructor(private readonly cookies: SessionCookies) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (!body || typeof body !== 'object' || typeof (body as { refreshToken?: unknown }).refreshToken !== 'string') return body;
        response.setHeader('Cache-Control', 'no-store');
        if (isAppRequest(request)) return body;
        const { refreshToken, ...rest } = body as { refreshToken: string };
        this.cookies.set(request, response, refreshToken);
        return rest;
      }),
    );
  }
}
