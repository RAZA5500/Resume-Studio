import { createHash } from 'node:crypto';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { BillingConfigService } from '../billing/billing-config.service.js';
import type { JwtPayload } from '../common/auth/auth.decorators.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { User } from '../users/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { AuthAttemptsService } from './security/auth-attempts.service.js';
import { PasswordHasher } from './security/password-hasher.service.js';
import { type PowChallenge, ProofOfWorkService } from './security/proof-of-work.service.js';

const IP = '203.0.113.7';
const GOOD_PASSWORD = 'Lahore-Rains-2026!';

function configOf(env: Record<string, string>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function solve(challenge: PowChallenge): string {
  for (let n = 0; n <= challenge.maxnumber; n++) {
    if (createHash('sha256').update(challenge.salt + n).digest('hex') === challenge.challenge) {
      const payload = { algorithm: challenge.algorithm, challenge: challenge.challenge, number: n, salt: challenge.salt, signature: challenge.signature };
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    }
  }
  throw new Error('unsolvable');
}

/** AuthService with an in-memory users table and the real security services. */
function setup(env: Record<string, string> = {}) {
  const config = configOf({ AUTH_POW_MAX_NUMBER: '1000', PASSWORD_BREACH_CHECK: 'false', ...env });
  const rows: (User & { passwordHash: string })[] = [];
  const users = {
    findByEmail: (email: string) => Promise.resolve(rows.find((u) => u.email === email.toLowerCase()) ?? null),
    findById: (id: string) => Promise.resolve(rows.find((u) => u.id === id)!),
    create: vi.fn((data: Pick<User, 'email' | 'fullName' | 'passwordHash'>) => {
      const user = { ...data, id: `u${rows.length + 1}`, headline: null, plan: 'free', planActivatedAt: null, tokenVersion: 0, createdAt: new Date() } as User;
      rows.push(user);
      return Promise.resolve(user);
    }),
    update: vi.fn((id: string, patch: Partial<User>) => {
      Object.assign(rows.find((u) => u.id === id)!, patch);
      return Promise.resolve(rows.find((u) => u.id === id)!);
    }),
    revokeSessions: vi.fn((id: string) => Promise.resolve(++rows.find((u) => u.id === id)!.tokenVersion)),
    sessionVersion: (id: string) => Promise.resolve(rows.find((u) => u.id === id)?.tokenVersion ?? null),
  };
  const jwt = new JwtService({ secret: 'test-secret-that-is-long-enough-1234', signOptions: { expiresIn: 3600 } });
  const hasher = new PasswordHasher();
  const attempts = new AuthAttemptsService();
  const pow = new ProofOfWorkService(config);
  const service = new AuthService(
    users as unknown as UsersService,
    jwt,
    new BillingConfigService(configOf({})),
    hasher,
    attempts,
    pow,
    config,
  );
  for (const target of [service, attempts]) Object.assign(target, { logger: { log: () => undefined, warn: () => undefined } });
  const proof = () => solve(pow.issue());
  const form = (extra: Record<string, unknown> = {}) => ({ pow: proof(), website: '', ...extra });
  return { service, users, rows, jwt, hasher, form };
}

async function errorOf(promise: Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    await promise;
  } catch (error) {
    const http = error as { getStatus: () => number; getResponse: () => Record<string, unknown> | string };
    const body = http.getResponse();
    return { status: http.getStatus(), body: typeof body === 'string' ? { message: body } : body };
  }
  throw new Error('expected the call to fail');
}

describe('AuthService sign-up', () => {
  it('creates the account and returns a token for it', async () => {
    const { service, jwt, form } = setup();
    const result = await service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP);
    expect(result.user).toMatchObject({ email: 'sara@example.com', fullName: 'Sara Khan', plan: 'free' });
    expect(await jwt.verifyAsync<JwtPayload>(result.accessToken)).toMatchObject({ sub: 'u1', tv: 0 });
  });

  it('turns bots away before doing any work', async () => {
    const { service, users, form } = setup();
    const base = { fullName: 'Bot', email: 'bot@example.com', password: GOOD_PASSWORD };
    expect((await errorOf(service.register({ ...base, ...form({ website: 'http://spam' }) }, IP))).body.code).toBe('BOT_DETECTED');
    expect((await errorOf(service.register({ ...base, ...form({ pow: undefined }) }, IP))).body.code).toBe('POW_REQUIRED');
    const used = form();
    await service.register({ ...base, ...used }, IP);
    expect((await errorOf(service.register({ ...base, email: 'bot2@example.com', ...used }, IP))).body.code).toBe('POW_INVALID');
    expect(users.create).toHaveBeenCalledTimes(1);
  });

  it('refuses weak and breached passwords', async () => {
    const { service, form } = setup({ PASSWORD_BREACH_CHECK: 'true' });
    const weak = await errorOf(service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: 'SaraKhan123', ...form() }, IP));
    expect(weak).toMatchObject({ status: 400, body: { code: 'WEAK_PASSWORD' } });

    const hash = createHash('sha1').update(GOOD_PASSWORD).digest('hex').toUpperCase();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`${hash.slice(5)}:3\r\n`)));
    try {
      const breached = await errorOf(service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP));
      expect(breached).toMatchObject({ status: 400, body: { code: 'BREACHED_PASSWORD' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('answers 409 for a taken email, also when two sign-ups race', async () => {
    const { service, users, form } = setup();
    await service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP);
    expect((await errorOf(service.register({ fullName: 'Sara', email: 'SARA@example.com', password: GOOD_PASSWORD, ...form() }, IP))).status).toBe(409);

    users.create.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { driverError: { code: '23505' } }));
    expect((await errorOf(service.register({ fullName: 'Ali Raza', email: 'ali@example.com', password: GOOD_PASSWORD, ...form() }, IP))).status).toBe(409);
  });
});

describe('AuthService sign-in', () => {
  async function withAccount() {
    const ctx = setup();
    await ctx.service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...ctx.form() }, IP);
    return ctx;
  }

  it('signs in with the right password only, case-insensitively by email', async () => {
    const { service, form } = await withAccount();
    await expect(service.login({ email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP)).resolves.toMatchObject({
      user: { email: 'sara@example.com' },
    });
    expect((await errorOf(service.login({ email: 'sara@example.com', password: 'wrong password', ...form() }, IP))).status).toBe(401);
  });

  it('hashes even for unknown emails and answers exactly like a wrong password', async () => {
    const { service, hasher, form } = await withAccount();
    const verify = vi.spyOn(hasher, 'verify');
    const unknown = await errorOf(service.login({ email: 'nobody@example.com', password: GOOD_PASSWORD, ...form() }, IP));
    const wrong = await errorOf(service.login({ email: 'sara@example.com', password: 'wrong password', ...form() }, IP));
    expect(verify).toHaveBeenCalledWith(GOOD_PASSWORD, undefined);
    expect(unknown).toEqual(wrong);
  });

  it('locks the account on this network after 5 wrong passwords, even for the right one', async () => {
    const { service, form } = await withAccount();
    for (let i = 0; i < 5; i++) await errorOf(service.login({ email: 'sara@example.com', password: `wrong-${i}-password`, ...form() }, IP));
    const locked = await errorOf(service.login({ email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP));
    expect(locked).toMatchObject({ status: 429, body: { code: 'TOO_MANY_ATTEMPTS', retryAfter: 900 } });
    // Unknown emails lock the same way, so a lock reveals nothing.
    for (let i = 0; i < 5; i++) await errorOf(service.login({ email: 'ghost@example.com', password: `wrong-${i}-password`, ...form() }, IP));
    expect((await errorOf(service.login({ email: 'ghost@example.com', password: GOOD_PASSWORD, ...form() }, IP))).status).toBe(429);
  });

  it('upgrades an old, cheaper password hash after a successful sign-in', async () => {
    const { service, rows, users, form } = await withAccount();
    rows[0].passwordHash = await bcrypt.hash(GOOD_PASSWORD, 10);
    await service.login({ email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP);
    await vi.waitFor(() => expect(users.update).toHaveBeenCalled());
    expect(bcrypt.getRounds(rows[0].passwordHash)).toBe(11);
  });
});

describe('AuthService password change and sessions', () => {
  it('changes the password, signs out other sessions and returns a token for this one', async () => {
    const { service, jwt, users, form } = setup();
    const { user } = await service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP);

    expect((await errorOf(service.changePassword(user.id, { currentPassword: 'wrong password', newPassword: 'Another-Good-Pass-9' }, IP))).status).toBe(400);
    expect((await errorOf(service.changePassword(user.id, { currentPassword: GOOD_PASSWORD, newPassword: GOOD_PASSWORD }, IP))).body.code).toBe('WEAK_PASSWORD');

    const changed = await service.changePassword(user.id, { currentPassword: GOOD_PASSWORD, newPassword: 'Another-Good-Pass-9' }, IP);
    expect(users.revokeSessions).toHaveBeenCalledWith(user.id);
    expect(await jwt.verifyAsync<JwtPayload>(changed.accessToken)).toMatchObject({ sub: user.id, tv: 1 });
    await expect(service.login({ email: 'sara@example.com', password: 'Another-Good-Pass-9', ...form() }, IP)).resolves.toBeTruthy();
  });

  it('locks password changes after repeated wrong current passwords', async () => {
    const { service, form } = setup();
    const { user } = await service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP);
    for (let i = 0; i < 5; i++) await errorOf(service.changePassword(user.id, { currentPassword: `wrong-${i}`, newPassword: 'Another-Good-Pass-9' }, IP));
    expect((await errorOf(service.changePassword(user.id, { currentPassword: GOOD_PASSWORD, newPassword: 'Another-Good-Pass-9' }, IP))).status).toBe(429);
  });
});

describe('JwtAuthGuard', () => {
  function guardFor(version: number | null | Error, isPublic = false) {
    const jwt = new JwtService({ secret: 'test-secret-that-is-long-enough-1234' });
    const users = {
      sessionVersion: () => (version instanceof Error ? Promise.reject(version) : Promise.resolve(version)),
    } as unknown as UsersService;
    const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
    return { guard: new JwtAuthGuard(jwt, reflector, users), jwt };
  }

  function contextWith(token?: string) {
    const request: { headers: Record<string, string>; user?: unknown } = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('accepts a current token and attaches the user', async () => {
    const { guard, jwt } = guardFor(2);
    const { context, request } = contextWith(await jwt.signAsync({ sub: 'u1', email: 'sara@example.com', tv: 2 }));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'sara@example.com' });
  });

  it('treats tokens issued before session versions as version 0', async () => {
    const { guard, jwt } = guardFor(0);
    await expect(guard.canActivate(contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co' })).context)).resolves.toBe(true);
  });

  it('rejects tokens of signed-out sessions and deleted accounts', async () => {
    for (const version of [3, null]) {
      const { guard, jwt } = guardFor(version);
      await expect(guard.canActivate(contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co', tv: 2 })).context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('lets public routes through as anonymous with a stale token', async () => {
    const { guard, jwt } = guardFor(5, true);
    const { context, request } = contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co', tv: 1 }));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('does not sign people out when the database has a hiccup', async () => {
    const { guard, jwt } = guardFor(new Error('connection reset'));
    await expect(guard.canActivate(contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co', tv: 0 })).context)).rejects.toThrow(
      'connection reset',
    );
  });
});
