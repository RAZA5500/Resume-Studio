import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { firstValueFrom, of } from 'rxjs';
import { REFRESH_COOKIE, refreshTokenFrom, SessionCookieInterceptor, SessionCookies } from './session-cookies.js';

const TOKEN = 'a'.repeat(43);

function configOf(env: Record<string, string>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function requestWith(headers: Record<string, string>, secure = false): Request {
  return { headers, secure } as unknown as Request;
}

function responseSpy() {
  const calls = { cookie: [] as unknown[][], clearCookie: [] as unknown[][], headers: {} as Record<string, string> };
  const response = {
    cookie: (...args: unknown[]) => calls.cookie.push(args),
    clearCookie: (...args: unknown[]) => calls.clearCookie.push(args),
    setHeader: (name: string, value: string) => (calls.headers[name] = value),
  } as unknown as Response;
  return { response, calls };
}

async function intercept(request: Request, body: unknown, env: Record<string, string> = {}) {
  const { response, calls } = responseSpy();
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext;
  const handler: CallHandler = { handle: () => of(body) };
  const result = await firstValueFrom(new SessionCookieInterceptor(new SessionCookies(configOf(env))).intercept(context, handler));
  return { result, calls };
}

describe('refreshTokenFrom', () => {
  it('reads the cookie on the web and ignores a token in the body', () => {
    const request = requestWith({ origin: 'https://resumestudio.site', cookie: `theme=dark; ${REFRESH_COOKIE}=${TOKEN}; other=1` });
    expect(refreshTokenFrom(request, 'b'.repeat(43))).toBe(TOKEN);
    expect(refreshTokenFrom(requestWith({ cookie: 'theme=dark' }), TOKEN)).toBeUndefined();
  });

  it('reads the body in the Android app', () => {
    expect(refreshTokenFrom(requestWith({ origin: 'https://localhost', cookie: `${REFRESH_COOKIE}=x` }), TOKEN)).toBe(TOKEN);
  });
});

describe('SessionCookieInterceptor', () => {
  it('moves the refresh token into an httpOnly cookie for the website', async () => {
    const request = requestWith({ origin: 'https://resumestudio.site', 'x-forwarded-proto': 'https' });
    const { result, calls } = await intercept(request, { accessToken: 'jwt', refreshToken: TOKEN, user: { id: 'u1' } });
    expect(result).toEqual({ accessToken: 'jwt', user: { id: 'u1' } });
    expect(calls.cookie).toEqual([
      [REFRESH_COOKIE, TOKEN, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth', maxAge: 7 * 24 * 60 * 60_000 }],
    ]);
    expect(calls.headers['Cache-Control']).toBe('no-store');
  });

  it('is not Secure over plain HTTP (local development) unless SameSite=None asks for it', async () => {
    const plain = await intercept(requestWith({}), { refreshToken: TOKEN });
    expect(plain.calls.cookie[0][2]).toMatchObject({ secure: false, sameSite: 'lax' });
    const crossSite = await intercept(requestWith({}), { refreshToken: TOKEN }, { AUTH_COOKIE_SAMESITE: 'none', JWT_EXPIRES_IN_DAYS: '30' });
    expect(crossSite.calls.cookie[0][2]).toMatchObject({ secure: true, sameSite: 'none', maxAge: 30 * 24 * 60 * 60_000 });
  });

  it('leaves the token in the body for the Android app', async () => {
    const { result, calls } = await intercept(requestWith({ origin: 'https://localhost' }), { accessToken: 'jwt', refreshToken: TOKEN });
    expect(result).toEqual({ accessToken: 'jwt', refreshToken: TOKEN });
    expect(calls.cookie).toHaveLength(0);
  });

  it('passes other answers through (two-factor challenge, no new token)', async () => {
    const challenge = { twoFactorRequired: true, challenge: 'c' };
    const { result, calls } = await intercept(requestWith({}), challenge);
    expect(result).toBe(challenge);
    expect(calls.cookie).toHaveLength(0);
  });
});
