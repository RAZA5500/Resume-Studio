import { createHash } from 'node:crypto';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { BillingConfigService } from '../billing/billing-config.service.js';
import { FindOperator, type Repository } from 'typeorm';
import { ALLOW_UNVERIFIED_KEY, IS_PUBLIC_KEY, type JwtPayload } from '../common/auth/auth.decorators.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { User } from '../users/user.entity.js';
import type { SessionState, UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { EmailVerification } from './email-verification/email-verification.entity.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';
import { AuthAttemptsService } from './security/auth-attempts.service.js';
import { PasswordHasher } from './security/password-hasher.service.js';
import { type PowChallenge, ProofOfWorkService } from './security/proof-of-work.service.js';
import type { RefreshToken } from './sessions/refresh-token.entity.js';
import { REUSE_GRACE_MS, RefreshTokenService } from './sessions/refresh-tokens.service.js';
import { base32Decode, hotp, timeStep } from './two-factor/totp.js';
import { type TwoFactorChallenge, TwoFactorService } from './two-factor/two-factor.service.js';

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

/** In-memory stand-in for the email_verifications table (only what EmailVerificationService uses). */
function verificationTable() {
  const rows = new Map<string, EmailVerification>();
  const matches = (row: EmailVerification, where: Partial<EmailVerification>) =>
    Object.entries(where).every(([key, value]) => row[key as keyof EmailVerification] === value);
  const find = (where: Partial<EmailVerification>) => [...rows.values()].find((row) => matches(row, where));
  const table = {
    findOneBy: (where: Partial<EmailVerification>) => {
      const row = find(where);
      return Promise.resolve(row ? { ...row } : null);
    },
    upsert: (entry: EmailVerification) => {
      rows.set(entry.userId, { ...rows.get(entry.userId), ...entry });
      return Promise.resolve();
    },
    update: (where: Partial<EmailVerification>, patch: Partial<EmailVerification>) => {
      const row = find(where);
      if (row) Object.assign(row, patch);
      return Promise.resolve();
    },
    increment: (where: Partial<EmailVerification>, column: 'attempts', by: number) => {
      const row = find(where);
      if (row) row[column] += by;
      return Promise.resolve();
    },
    delete: (where: Partial<EmailVerification>) => {
      for (const [key, row] of rows) if (matches(row, where)) rows.delete(key);
      return Promise.resolve();
    },
  };
  return { rows, repository: table as unknown as Repository<EmailVerification> };
}

/** In-memory stand-in for the refresh_tokens table (only what RefreshTokenService uses). */
function refreshTable() {
  const rows: RefreshToken[] = [];
  const matches = (row: RefreshToken, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      const actual = row[key as keyof RefreshToken];
      if (value instanceof FindOperator) {
        if (value.type === 'isNull') return actual == null;
        if (value.type === 'lessThan') return (actual as Date) < (value.value as Date);
        throw new Error(`unsupported operator ${value.type}`);
      }
      return actual === value;
    });
  const table = {
    insert: (entry: Omit<RefreshToken, 'id' | 'createdAt'>) => {
      rows.push({ ...entry, id: `rt${rows.length + 1}`, createdAt: new Date() });
      return Promise.resolve();
    },
    findOneBy: (where: Record<string, unknown>) => {
      const row = rows.find((r) => matches(r, where));
      return Promise.resolve(row ? { ...row } : null);
    },
    update: (where: Record<string, unknown>, patch: Partial<RefreshToken>) => {
      const found = rows.filter((r) => matches(r, where));
      for (const row of found) Object.assign(row, patch);
      return Promise.resolve({ affected: found.length });
    },
    delete: (where: Record<string, unknown>) => {
      const keep = rows.filter((r) => !matches(r, where));
      rows.splice(0, rows.length, ...keep);
      return Promise.resolve();
    },
  };
  return { rows, repository: table as unknown as Repository<RefreshToken> };
}

/** The code and the link token in a verification email. */
function codeOf(message: MailMessage): string {
  return /code is: (\d{6})/.exec(message.text)![1];
}
function tokenOf(message: MailMessage): string {
  return /token=([A-Za-z0-9_-]{43})/.exec(message.text)![1];
}

/**
 * AuthService with an in-memory users table and the real security services. Email is off unless
 * `mail` is set; sent emails land in `outbox`.
 */
function setup(env: Record<string, string> = {}, { mail: mailOn = false } = {}) {
  const config = configOf({ AUTH_POW_MAX_NUMBER: '1000', PASSWORD_BREACH_CHECK: 'false', JWT_SECRET: 'test-secret-that-is-long-enough-1234', ...env });
  const rows: User[] = [];
  const users = {
    findByEmail: (email: string) => Promise.resolve(rows.find((u) => u.email === email.toLowerCase()) ?? null),
    findById: (id: string) => Promise.resolve(rows.find((u) => u.id === id)!),
    create: vi.fn((data: Pick<User, 'email' | 'fullName' | 'passwordHash'>) => {
      const user = {
        emailVerifiedAt: null,
        ...data,
        id: `u${rows.length + 1}`,
        headline: null,
        plan: 'free',
        planActivatedAt: null,
        tokenVersion: 0,
        createdAt: new Date(),
      } as User;
      rows.push(user);
      return Promise.resolve(user);
    }),
    update: vi.fn((id: string, patch: Partial<User>) => {
      Object.assign(rows.find((u) => u.id === id)!, patch);
      return Promise.resolve(rows.find((u) => u.id === id)!);
    }),
    revokeSessions: vi.fn((id: string) => Promise.resolve(++rows.find((u) => u.id === id)!.tokenVersion)),
    changeEmail: (id: string, email: string) => {
      Object.assign(rows.find((u) => u.id === id)!, { email, emailVerifiedAt: null });
      return Promise.resolve(rows.find((u) => u.id === id)!);
    },
    session: (id: string) => {
      const row = rows.find((u) => u.id === id);
      return Promise.resolve(row ? { version: row.tokenVersion, emailVerified: !!row.emailVerifiedAt } : null);
    },
    loginMethods: (id: string) => {
      const row = rows.find((u) => u.id === id);
      return Promise.resolve({ hasPassword: !!row?.passwordHash, providers: [], twoFactorEnabled: !!row?.twoFactorEnabledAt, backupCodesLeft: row?.twoFactorBackupCodes?.length ?? 0 });
    },
    twoFactorState: (id: string) => {
      const row = rows.find((u) => u.id === id)!;
      return Promise.resolve({ secret: row.twoFactorSecret ?? null, enabledAt: row.twoFactorEnabledAt ?? null, lastStep: row.twoFactorLastStep ?? null, backupCodes: row.twoFactorBackupCodes ?? [] });
    },
    useTotpStep: (id: string, step: number) => {
      const row = rows.find((u) => u.id === id)!;
      if (row.twoFactorLastStep != null && row.twoFactorLastStep >= step) return Promise.resolve(false);
      row.twoFactorLastStep = step;
      return Promise.resolve(true);
    },
    useBackupCode: (id: string, hash: string) => {
      const row = rows.find((u) => u.id === id)!;
      if (!row.twoFactorBackupCodes?.includes(hash)) return Promise.resolve(false);
      row.twoFactorBackupCodes = row.twoFactorBackupCodes.filter((h) => h !== hash);
      return Promise.resolve(true);
    },
  };
  const jwt = new JwtService({ secret: 'test-secret-that-is-long-enough-1234', signOptions: { expiresIn: 3600 } });
  const hasher = new PasswordHasher();
  const attempts = new AuthAttemptsService();
  const pow = new ProofOfWorkService(config);
  const twoFactor = new TwoFactorService(users as unknown as UsersService, attempts, config);
  const outbox: MailMessage[] = [];
  const mail = {
    enabled: mailOn,
    send: vi.fn((message: MailMessage) => {
      outbox.push(message);
      return Promise.resolve();
    }),
  };
  const table = verificationTable();
  const verification = new EmailVerificationService(table.repository, users as unknown as UsersService, mail as unknown as MailService, config);
  const refresh = refreshTable();
  const sessions = new RefreshTokenService(refresh.repository, config);
  const service = new AuthService(
    users as unknown as UsersService,
    jwt,
    new BillingConfigService(configOf({})),
    hasher,
    attempts,
    pow,
    twoFactor,
    verification,
    sessions,
    config,
  );
  for (const target of [service, attempts, twoFactor, verification, sessions]) {
    Object.assign(target, { logger: { log: () => undefined, warn: () => undefined, error: () => undefined } });
  }
  const proof = () => solve(pow.issue());
  const form = (extra: Record<string, unknown> = {}) => ({ pow: proof(), website: '', ...extra });
  return { service, users, rows, jwt, hasher, form, twoFactor, verification, mail, outbox, table, sessions, refresh };
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
    // The re-hash runs in the background (one bcrypt hash; slow on a busy machine).
    await vi.waitFor(() => expect(users.update).toHaveBeenCalled(), { timeout: 15_000 });
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

describe('Refresh tokens', () => {
  afterEach(() => vi.useRealTimers());

  async function signedIn() {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T10:00:00Z') });
    const ctx = setup();
    const session = await ctx.service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...ctx.form() }, IP);
    return { ...ctx, session, later: (ms: number) => vi.setSystemTime(Date.now() + ms) };
  }

  it('comes with every sign-in and is stored only as a hash', async () => {
    const { session, refresh } = await signedIn();
    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(refresh.rows).toHaveLength(1);
    expect(refresh.rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(refresh.rows)).not.toContain(session.refreshToken);
  });

  it('gives a new access token and swaps itself for a new refresh token', async () => {
    const { service, session, jwt } = await signedIn();
    const renewed = await service.refresh(session.refreshToken);
    expect(await jwt.verifyAsync<JwtPayload>(renewed.accessToken)).toMatchObject({ sub: session.user.id, tv: 0 });
    expect(renewed.user).toMatchObject({ email: 'sara@example.com' });
    expect(renewed.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(renewed.refreshToken).not.toBe(session.refreshToken);
    await expect(service.refresh(renewed.refreshToken)).resolves.toHaveProperty('refreshToken');
  });

  it('lets a parallel refresh through without a second replacement', async () => {
    const { service, session } = await signedIn();
    const first = await service.refresh(session.refreshToken);
    const second = await service.refresh(session.refreshToken);
    expect(second.accessToken).toEqual(expect.any(String));
    expect(second).not.toHaveProperty('refreshToken');
    await expect(service.refresh(first.refreshToken)).resolves.toHaveProperty('refreshToken');
  });

  it('ends the whole sign-in when a replaced token comes back later', async () => {
    const { service, session, later } = await signedIn();
    const renewed = await service.refresh(session.refreshToken);
    later(REUSE_GRACE_MS + 1_000);
    const reuse = await errorOf(service.refresh(session.refreshToken));
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('SESSION_EXPIRED');
    expect((await errorOf(service.refresh(renewed.refreshToken))).status).toBe(401);
  });

  it('expires after the session length, and each refresh extends it', async () => {
    const { service, session, later } = await signedIn();
    later(6 * 24 * 60 * 60_000);
    const renewed = await service.refresh(session.refreshToken);
    later(6 * 24 * 60 * 60_000);
    const again = await service.refresh(renewed.refreshToken);
    later(7 * 24 * 60 * 60_000 + 1_000);
    expect((await errorOf(service.refresh(again.refreshToken))).status).toBe(401);
  });

  it('turns down missing and made-up tokens', async () => {
    const { service } = await signedIn();
    expect((await errorOf(service.refresh(undefined))).status).toBe(401);
    expect((await errorOf(service.refresh('not a token'))).status).toBe(401);
    expect((await errorOf(service.refresh('A'.repeat(43)))).status).toBe(401);
  });

  it('stops working after signing out on this device', async () => {
    const { service, session } = await signedIn();
    const renewed = await service.refresh(session.refreshToken);
    await service.logout(renewed.refreshToken);
    expect((await errorOf(service.refresh(renewed.refreshToken))).status).toBe(401);
  });

  it('ends on every device after a password change, except the token the change returns', async () => {
    const { service, session, jwt, form } = await signedIn();
    const other = (await service.login({ email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP)) as { refreshToken: string };
    const changed = await service.changePassword(session.user.id, { currentPassword: GOOD_PASSWORD, newPassword: 'Another-Good-Pass-9' }, IP);
    expect((await errorOf(service.refresh(session.refreshToken))).status).toBe(401);
    expect((await errorOf(service.refresh(other.refreshToken))).status).toBe(401);
    const renewed = await service.refresh(changed.refreshToken);
    expect(await jwt.verifyAsync<JwtPayload>(renewed.accessToken)).toMatchObject({ tv: 1 });
  });

  it('ends on every device after "sign out everywhere"', async () => {
    const { service, session, refresh } = await signedIn();
    await service.logoutEverywhere(session.user.id);
    expect(refresh.rows).toHaveLength(0);
    expect((await errorOf(service.refresh(session.refreshToken))).status).toBe(401);
  });

  it('ends when the account is gone', async () => {
    const { service, session, rows } = await signedIn();
    rows.splice(0, rows.length);
    expect((await errorOf(service.refresh(session.refreshToken))).status).toBe(401);
  });

  it('turns down a token from before the account signed out everywhere, even if its row is still there', async () => {
    const { service, session, users } = await signedIn();
    await users.revokeSessions(session.user.id);
    expect((await errorOf(service.refresh(session.refreshToken))).status).toBe(401);
  });
});

describe('Two-factor sign-in', () => {
  const STEP_MS = 30_000;
  afterEach(() => vi.useRealTimers());

  /** An account with two-factor on; `code()` gives the app code for the current (fake) time. */
  async function withTwoFactor() {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T10:00:00Z') });
    const ctx = setup();
    const { user } = await ctx.service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...ctx.form() }, IP);
    const { secret, uri, qrSvg } = await ctx.twoFactor.setup(user.id);
    const code = () => hotp(base32Decode(secret), timeStep());
    const nextCode = () => {
      vi.setSystemTime(Date.now() + STEP_MS);
      return code();
    };
    const { backupCodes } = await ctx.twoFactor.enable(user.id, code(), IP);
    const login = (extra: Record<string, unknown> = {}) =>
      ctx.service.login({ email: 'sara@example.com', password: GOOD_PASSWORD, ...ctx.form(), ...extra }, IP) as Promise<TwoFactorChallenge>;
    return { ...ctx, user, secret, uri, qrSvg, code, nextCode, backupCodes, login };
  }

  it('sets up with a QR code and confirms with a code from the app', async () => {
    const { uri, qrSvg, backupCodes, rows } = await withTwoFactor();
    expect(uri).toMatch(/^otpauth:\/\/totp\/ResumeStudio:sara%40example\.com\?secret=[A-Z2-7]{32}&issuer=ResumeStudio/);
    expect(qrSvg.startsWith('<svg')).toBe(true);
    expect(backupCodes).toHaveLength(10);
    expect(backupCodes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(rows[0].twoFactorSecret).toMatch(/^v1\./); // stored encrypted
    expect(rows[0].twoFactorBackupCodes).not.toContain(backupCodes[0]); // only hashes
  });

  it('asks for the code after the password, and only a fresh code completes the sign-in', async () => {
    const { service, login, code, nextCode, jwt } = await withTwoFactor();
    const first = await login();
    expect(first).toEqual({ twoFactorRequired: true, challenge: expect.any(String), methods: ['app', 'backup'] });
    expect(first).not.toHaveProperty('accessToken');

    // The code that turned 2FA on was already used.
    expect((await errorOf(service.verifyTwoFactor({ challenge: first.challenge, code: code() }, IP))).body.code).toBe('INVALID_2FA_CODE');
    const session = await service.verifyTwoFactor({ challenge: first.challenge, code: nextCode() }, IP);
    expect(await jwt.verifyAsync<JwtPayload>(session.accessToken)).toMatchObject({ tv: 0 });
    expect(session.user.twoFactorEnabled).toBe(true);
    // A finished challenge cannot be used again.
    expect((await errorOf(service.verifyTwoFactor({ challenge: first.challenge, code: nextCode() }, IP))).body.code).toBe('TWO_FACTOR_EXPIRED');
  });

  it('accepts each backup code once', async () => {
    const { service, login, backupCodes } = await withTwoFactor();
    const session = await service.verifyTwoFactor({ challenge: (await login()).challenge, code: backupCodes[3].toUpperCase() }, IP);
    expect(session.user.backupCodesLeft).toBe(9);
    expect((await errorOf(service.verifyTwoFactor({ challenge: (await login()).challenge, code: backupCodes[3] }, IP))).status).toBe(400);
  });

  it('ends a challenge after five wrong codes and locks two-factor attempts for a while', async () => {
    const { service, login, nextCode } = await withTwoFactor();
    const { challenge } = await login();
    for (let i = 0; i < 5; i++) await errorOf(service.verifyTwoFactor({ challenge, code: String(100000 + i) }, IP));
    expect((await errorOf(service.verifyTwoFactor({ challenge, code: nextCode() }, IP))).status).toBeGreaterThanOrEqual(400);
    const again = await login();
    expect((await errorOf(service.verifyTwoFactor({ challenge: again.challenge, code: nextCode() }, IP))).status).toBe(429);
  });

  it('skips the code on a remembered device until the password changes', async () => {
    const { service, login, nextCode, user, form } = await withTwoFactor();
    const session = await service.verifyTwoFactor({ challenge: (await login()).challenge, code: nextCode(), rememberDevice: true }, IP);
    expect(session.trustedDevice).toEqual(expect.any(String));

    const direct = (await login({ devices: [session.trustedDevice] })) as unknown as { accessToken?: string };
    expect(direct.accessToken).toEqual(expect.any(String));
    expect(await login({ devices: ['forged.token'] })).toMatchObject({ twoFactorRequired: true });

    await service.changePassword(user.id, { currentPassword: GOOD_PASSWORD, newPassword: 'Another-Good-Pass-9' }, IP);
    const afterChange = await service.login(
      { email: 'sara@example.com', password: 'Another-Good-Pass-9', ...form(), devices: [session.trustedDevice!] },
      IP,
    );
    expect(afterChange).toMatchObject({ twoFactorRequired: true });
  });

  it('turns off only with a valid code, and then signs in without one', async () => {
    const { service, twoFactor, user, nextCode, form, rows } = await withTwoFactor();
    expect((await errorOf(twoFactor.disable(user.id, '000000', IP))).body.code).toBe('INVALID_2FA_CODE');
    await twoFactor.disable(user.id, nextCode(), IP);
    expect(rows[0]).toMatchObject({ twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorBackupCodes: null });
    const result = (await service.login({ email: 'sara@example.com', password: GOOD_PASSWORD, ...form() }, IP)) as unknown as { accessToken?: string };
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it('replaces the backup codes on request', async () => {
    const { twoFactor, user, nextCode, backupCodes, service, login } = await withTwoFactor();
    const { backupCodes: fresh } = await twoFactor.regenerateBackupCodes(user.id, nextCode(), IP);
    expect(fresh).toHaveLength(10);
    expect((await errorOf(service.verifyTwoFactor({ challenge: (await login()).challenge, code: backupCodes[0] }, IP))).status).toBe(400);
    await expect(service.verifyTwoFactor({ challenge: (await login()).challenge, code: fresh[0] }, IP)).resolves.toHaveProperty('accessToken');
  });
});

describe('Email verification', () => {
  afterEach(() => vi.useRealTimers());

  /** A new email + password account with email on; `later(s)` moves the (fake) clock. */
  async function signedUp() {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T10:00:00Z') });
    const ctx = setup({}, { mail: true });
    const session = await ctx.service.register({ fullName: 'Sara Khan', email: 'sara@example.com', password: GOOD_PASSWORD, ...ctx.form() }, IP);
    const account = () => ctx.rows.find((u) => u.id === session.user.id)!;
    const later = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);
    return { ...ctx, session, account, later };
  }

  /** Any 6-digit code except this one. */
  const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  it('asks new email + password accounts to verify, but only while email is on', async () => {
    const { session } = await signedUp();
    expect(session.user).toMatchObject({ emailVerified: false, mustVerifyEmail: true });

    const off = setup();
    const { user } = await off.service.register({ fullName: 'Ali Raza', email: 'ali@example.com', password: GOOD_PASSWORD, ...off.form() }, IP);
    expect(user).toMatchObject({ emailVerified: false, mustVerifyEmail: false });
    expect((await errorOf(off.verification.send(off.rows[0]))).body.code).toBe('VERIFICATION_OFF');
  });

  it('emails a code and a link, stores only keyed hashes, and keeps a working code when the page opens again', async () => {
    const { verification, account, outbox, table, later } = await signedUp();
    await expect(verification.send(account())).resolves.toEqual({ sent: true, retryAfter: 60 });
    expect(outbox).toHaveLength(1);
    const [email] = outbox;
    expect(email.to).toBe('sara@example.com');
    expect(email.subject).toBe(`${codeOf(email)} is your ResumeStudio verification code`);
    expect(email.html).toContain(`http://localhost:4200/verify-email?token=${tokenOf(email)}`);
    const stored = table.rows.get(account().id)!;
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.linkHash).toMatch(/^[0-9a-f]{64}$/);
    expect([stored.codeHash, stored.linkHash]).not.toContain(createHash('sha256').update(codeOf(email)).digest('hex'));

    // Opening the verification page again does not replace the code that is in the inbox.
    later(120);
    await expect(verification.send(account())).resolves.toEqual({ sent: false, retryAfter: 0 });
    expect(outbox).toHaveLength(1);
    // Close to expiry it sends a fresh one.
    later(26 * 60);
    await expect(verification.send(account())).resolves.toEqual({ sent: true, retryAfter: 60 });
  });

  it('spaces emails a minute apart, at most five an hour, and a new email replaces the old code and link', async () => {
    const { verification, account, outbox, later } = await signedUp();
    await verification.send(account());
    expect(await errorOf(verification.resend(account()))).toMatchObject({ status: 429, body: { code: 'TOO_MANY_ATTEMPTS', retryAfter: 60 } });
    later(61);
    await verification.resend(account());
    expect(outbox).toHaveLength(2);
    expect((await errorOf(verification.verifyLink(tokenOf(outbox[0]), account().id, false))).body.code).toBe('VERIFICATION_EXPIRED');

    for (let i = 0; i < 3; i++) {
      later(61);
      await verification.resend(account());
    }
    later(61);
    const capped = await errorOf(verification.resend(account()));
    expect(capped).toMatchObject({ status: 429, body: { message: expect.stringContaining('minutes') } });
    later(3600);
    await expect(verification.resend(account())).resolves.toEqual({ sent: true, retryAfter: 60 });
  });

  it('verifies with the right code only; five wrong tries end the code', async () => {
    const { service, verification, account, outbox, table, later } = await signedUp();
    await verification.send(account());
    const code = codeOf(outbox[0]);
    expect(await errorOf(verification.verifyCode(account(), wrong(code)))).toMatchObject({ status: 400, body: { code: 'INVALID_VERIFICATION_CODE' } });
    for (let i = 0; i < 3; i++) await errorOf(verification.verifyCode(account(), wrong(code)));
    expect((await errorOf(verification.verifyCode(account(), wrong(code)))).body.code).toBe('VERIFICATION_EXPIRED');
    expect((await errorOf(verification.verifyCode(account(), code))).body.code).toBe('VERIFICATION_EXPIRED');

    later(61);
    await verification.resend(account());
    await verification.verifyCode(account(), codeOf(outbox[1]));
    expect(account().emailVerifiedAt).toBeInstanceOf(Date);
    expect(table.rows.size).toBe(0);
    expect(await service.me(account().id)).toMatchObject({ emailVerified: true, mustVerifyEmail: false });
    // Typing the code again (e.g. after the link already did it) is fine.
    await expect(verification.verifyCode(account(), codeOf(outbox[1]))).resolves.toBeUndefined();
    expect((await errorOf(verification.resend(account()))).body.code).toBe('ALREADY_VERIFIED');
  });

  it('verifies with the link: at once where its account is signed in, after a click anywhere else', async () => {
    const { verification, account, outbox } = await signedUp();
    await verification.send(account());
    const token = tokenOf(outbox[0]);

    // A mail scanner or someone else's browser opening the link does not verify the address.
    await expect(verification.verifyLink(token, undefined, false)).resolves.toEqual({ verified: false, needsConfirmation: true, email: 's***@example.com' });
    await expect(verification.verifyLink(token, 'someone-else', false)).resolves.toMatchObject({ verified: false });
    expect(account().emailVerifiedAt).toBeNull();
    await expect(verification.verifyLink(token, undefined, true)).resolves.toEqual({ verified: true, email: 's***@example.com' });
    expect(account().emailVerifiedAt).toBeInstanceOf(Date);
    expect((await errorOf(verification.verifyLink(token, account().id, true))).body.code).toBe('VERIFICATION_EXPIRED');

    const other = await signedUp();
    await other.verification.send(other.account());
    other.later(31 * 60);
    expect((await errorOf(other.verification.verifyLink(tokenOf(other.outbox[0]), other.account().id, false))).body.code).toBe('VERIFICATION_EXPIRED');
    const fresh = await signedUp();
    await fresh.verification.send(fresh.account());
    await expect(fresh.verification.verifyLink(tokenOf(fresh.outbox[0]), fresh.account().id, false)).resolves.toMatchObject({ verified: true });
  });

  it('lets the page ask again at once when an email could not be sent, keeping the earlier code', async () => {
    const { verification, account, outbox, mail, table, later } = await signedUp();
    mail.send.mockRejectedValueOnce(new Error('SMTP down'));
    expect(await errorOf(verification.send(account()))).toMatchObject({ status: 503, body: { code: 'EMAIL_NOT_SENT' } });
    expect(table.rows.size).toBe(0);
    await expect(verification.send(account())).resolves.toMatchObject({ sent: true });

    later(61);
    mail.send.mockRejectedValueOnce(new Error('SMTP down'));
    expect((await errorOf(verification.resend(account()))).status).toBe(503);
    await verification.verifyCode(account(), codeOf(outbox[0]));
    expect(account().emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('moves an unverified account to a corrected address, with its password', async () => {
    const { service, verification, account, outbox, form } = await signedUp();
    await verification.send(account());
    await service.register({ fullName: 'Ali Raza', email: 'ali@example.com', password: GOOD_PASSWORD, ...form() }, IP);

    expect((await errorOf(service.changeEmail(account().id, { email: 'sara.k@example.com', password: 'wrong password' }, IP))).body.code).toBe(
      'WRONG_PASSWORD',
    );
    expect((await errorOf(service.changeEmail(account().id, { email: 'ali@example.com', password: GOOD_PASSWORD }, IP))).status).toBe(409);

    const moved = await service.changeEmail(account().id, { email: 'sara.k@example.com', password: GOOD_PASSWORD }, IP);
    expect(moved).toMatchObject({ email: 'sara.k@example.com', mustVerifyEmail: true });
    // The code sent to the old address stops working; the new address gets one right away.
    expect((await errorOf(verification.verifyCode(account(), codeOf(outbox[0])))).body.code).toBe('VERIFICATION_EXPIRED');
    await expect(verification.send(account())).resolves.toMatchObject({ sent: true });
    expect(outbox.at(-1)!.to).toBe('sara.k@example.com');

    await verification.verifyCode(account(), codeOf(outbox.at(-1)!));
    expect((await errorOf(service.changeEmail(account().id, { email: 'sara@example.com', password: GOOD_PASSWORD }, IP))).body.code).toBe(
      'EMAIL_CHANGE_UNAVAILABLE',
    );
  });
});

describe('JwtAuthGuard', () => {
  const current = (version: number): SessionState => ({ version, emailVerified: true });

  function guardFor(state: SessionState | null | Error, options: { isPublic?: boolean; allowUnverified?: boolean; mail?: boolean } = {}) {
    const jwt = new JwtService({ secret: 'test-secret-that-is-long-enough-1234' });
    const users = {
      session: () => (state instanceof Error ? Promise.reject(state) : Promise.resolve(state)),
    } as unknown as UsersService;
    const flags: Record<string, boolean | undefined> = { [IS_PUBLIC_KEY]: options.isPublic, [ALLOW_UNVERIFIED_KEY]: options.allowUnverified };
    const reflector = { getAllAndOverride: (key: string) => flags[key] } as unknown as Reflector;
    const mail = { enabled: options.mail ?? true } as MailService;
    return { guard: new JwtAuthGuard(jwt, reflector, users, mail), jwt };
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
    const { guard, jwt } = guardFor(current(2));
    const { context, request } = contextWith(await jwt.signAsync({ sub: 'u1', email: 'sara@example.com', tv: 2 }));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'sara@example.com' });
  });

  it('treats tokens issued before session versions as version 0', async () => {
    const { guard, jwt } = guardFor(current(0));
    await expect(guard.canActivate(contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co' })).context)).resolves.toBe(true);
  });

  it('rejects tokens of signed-out sessions and deleted accounts', async () => {
    for (const state of [current(3), null]) {
      const { guard, jwt } = guardFor(state);
      await expect(guard.canActivate(contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co', tv: 2 })).context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('lets public routes through as anonymous with a stale token', async () => {
    const { guard, jwt } = guardFor(current(5), { isPublic: true });
    const { context, request } = contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co', tv: 1 }));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('keeps accounts with an unverified email to the routes that allow it, while email is on', async () => {
    const unverified: SessionState = { version: 0, emailVerified: false };
    const token = await guardFor(null).jwt.signAsync({ sub: 'u1', email: 'a@b.co', tv: 0 });

    const blocked = await errorOf(guardFor(unverified).guard.canActivate(contextWith(token).context));
    expect(blocked).toMatchObject({ status: 403, body: { code: 'EMAIL_NOT_VERIFIED' } });

    for (const options of [{ allowUnverified: true }, { isPublic: true }, { mail: false }]) {
      const { context, request } = contextWith(token);
      await expect(guardFor(unverified, options).guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({ id: 'u1', email: 'a@b.co' });
    }
  });

  it('does not sign people out when the database has a hiccup', async () => {
    const { guard, jwt } = guardFor(new Error('connection reset'));
    await expect(guard.canActivate(contextWith(await jwt.signAsync({ sub: 'u1', email: 'a@b.co', tv: 0 })).context)).rejects.toThrow(
      'connection reset',
    );
  });
});
