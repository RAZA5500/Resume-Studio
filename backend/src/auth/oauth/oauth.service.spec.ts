import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign, verify } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { IdentityProvider, UserIdentity } from '../../users/user-identity.entity.js';
import type { User } from '../../users/user.entity.js';
import type { UsersService } from '../../users/users.service.js';
import type { AuthService } from '../auth.service.js';
import { AuthAttemptsService } from '../security/auth-attempts.service.js';
import { IdTokenError, JwksKeys, verifyIdToken } from './id-token.js';
import { AppleProvider, GoogleProvider, type ProviderEndpoints } from './oauth-providers.js';
import { displayName, OAuthService } from './oauth.service.js';

const IP = '198.51.100.4';

/** A tiny identity provider: RSA signing key, JWKS, and a token endpoint answering per code. */
function fakeIdp(issuer: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'test-key-1';
  const endpoints: ProviderEndpoints = {
    authorize: `${issuer}/authorize`,
    token: `${issuer}/token`,
    keys: `${issuer}/keys`,
    issuers: [issuer],
  };
  const pending = new Map<string, Record<string, unknown>>();
  const tokenRequests: URLSearchParams[] = [];

  const signToken = (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid }, key: KeyObject = privateKey) => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const input = `${encode(header)}.${encode(claims)}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  };

  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const target = String(url);
    if (target === endpoints.keys) {
      return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' }] });
    }
    if (target === endpoints.token) {
      const form = new URLSearchParams(String(init?.body));
      tokenRequests.push(form);
      const claims = pending.get(form.get('code') ?? '');
      if (!claims) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ id_token: signToken(claims) });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  /** What the provider will say for this code; the nonce comes from the authorization request. */
  const approve = (authorizeUrl: string, claims: Record<string, unknown>) => {
    const params = new URL(authorizeUrl).searchParams;
    const code = randomBytes(12).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    pending.set(code, { iss: issuer, aud: params.get('client_id'), iat: now, exp: now + 600, nonce: params.get('nonce'), ...claims });
    return { code, state: params.get('state')! };
  };
  return { endpoints, fetcher, approve, signToken, tokenRequests, kid, privateKey };
}

/** OAuthService over in-memory users/identities, with the fake providers. */
function setup() {
  const google = fakeIdp('https://accounts.google.test');
  const users: (User & { passwordHash: string | null })[] = [];
  const identities: UserIdentity[] = [];
  const store = {
    findIdentity: (provider: IdentityProvider, subject: string) =>
      Promise.resolve(identities.find((i) => i.provider === provider && i.subject === subject) ?? null),
    touchIdentity: () => Promise.resolve(),
    linkIdentity: vi.fn((userId: string, provider: IdentityProvider, subject: string, email: string | null) => {
      identities.push({ id: randomBytes(4).toString('hex'), userId, provider, subject, email, createdAt: new Date(), lastUsedAt: new Date() });
      return Promise.resolve();
    }),
    findByEmail: (email: string) => Promise.resolve(users.find((u) => u.email === email) ?? null),
    findById: (id: string) => Promise.resolve(users.find((u) => u.id === id)!),
    create: vi.fn((data: Partial<User>) => {
      const user = { id: `u${users.length + 1}`, headline: null, plan: 'free', planActivatedAt: null, tokenVersion: 0, createdAt: new Date(), ...data } as User;
      users.push(user);
      return Promise.resolve(user);
    }),
    update: vi.fn((id: string, patch: Partial<User>) => {
      Object.assign(users.find((u) => u.id === id)!, patch);
      return Promise.resolve(users.find((u) => u.id === id)!);
    }),
    revokeSessions: vi.fn((id: string) => Promise.resolve(++users.find((u) => u.id === id)!.tokenVersion)),
  };
  // Like AuthService: a challenge when two-factor is on and no remembered-device token is sent.
  const auth = {
    sessionOrChallenge: vi.fn((user: User, devices?: readonly string[]) =>
      user.twoFactorEnabledAt && !devices?.includes('trusted-device')
        ? { twoFactorRequired: true, challenge: `challenge-for-${user.id}`, methods: ['app', 'backup'] }
        : Promise.resolve({ accessToken: `token-for-${user.id}`, user }),
    ),
  };
  const attempts = new AuthAttemptsService();
  Object.assign(attempts, { logger: { warn: () => undefined } });
  const providers = new Map([['google', new GoogleProvider('google-client', 'google-secret', google.endpoints, google.fetcher)]]) as Map<
    IdentityProvider,
    GoogleProvider
  >;
  const service = new OAuthService(
    store as unknown as UsersService,
    auth as unknown as AuthService,
    attempts,
    providers,
    { get: (key: string) => (key === 'FRONTEND_URL' ? 'https://resume.example.com' : undefined) } as unknown as ConfigService,
  );
  Object.assign(service, { logger: { log: () => undefined, warn: () => undefined } });

  /** Runs the whole browser leg: start, provider approves with these claims, callback. */
  const signIn = async (claims: Record<string, unknown>, client = 'web') => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorizeUrl = service.start('google', client, challenge);
    const { code, state } = google.approve(authorizeUrl, claims);
    const outcome = await service.callback('google', { code, state }, IP);
    return { outcome, verifier, authorizeUrl, state };
  };
  return { service, google, users, identities, store, signIn, auth };
}

const GOOGLE_PERSON = { sub: 'google-123', email: 'Sara.Khan@Gmail.com', email_verified: true, name: 'Sara Khan' };

describe('verifyIdToken', () => {
  const idp = fakeIdp('https://idp.test');
  const keys = new JwksKeys(idp.endpoints.keys, idp.fetcher);
  const now = Math.floor(Date.now() / 1000);
  const good = { iss: 'https://idp.test', aud: 'my-app', sub: 'person-1', nonce: 'n-1', iat: now, exp: now + 600 };
  const expected = { issuers: ['https://idp.test'], audience: 'my-app', nonce: 'n-1' };

  it('accepts a token signed by the provider for us', async () => {
    await expect(verifyIdToken(idp.signToken(good), keys, expected)).resolves.toMatchObject({ sub: 'person-1' });
  });

  it('refuses tokens for another app, from another issuer, expired, replayed or tampered with', async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ ...good, aud: 'other-app' }, /another app/],
      [{ ...good, iss: 'https://evil.test' }, /issuer/],
      [{ ...good, exp: now - 3600 }, /expired/],
      [{ ...good, nonce: 'n-2' }, /Nonce/],
    ];
    for (const [claims, message] of cases) await expect(verifyIdToken(idp.signToken(claims), keys, expected)).rejects.toThrow(message);

    const [header, , signature] = idp.signToken(good).split('.');
    const forged = Buffer.from(JSON.stringify({ ...good, sub: 'admin' })).toString('base64url');
    await expect(verifyIdToken(`${header}.${forged}.${signature}`, keys, expected)).rejects.toThrow(/signature/);
  });

  it('refuses unsigned tokens and other algorithms or keys', async () => {
    const body = Buffer.from(JSON.stringify(good)).toString('base64url');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${body}.`;
    await expect(verifyIdToken(none, keys, expected)).rejects.toBeInstanceOf(IdTokenError);
    await expect(verifyIdToken(idp.signToken(good, { alg: 'RS256', kid: 'unknown' }), keys, expected)).rejects.toThrow(/Unknown/);
    const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await expect(verifyIdToken(idp.signToken(good, { alg: 'RS256', kid: idp.kid }, stranger), keys, expected)).rejects.toThrow(/signature/);
  });
});

describe('Google and Apple providers', () => {
  it('asks Google for openid email profile with PKCE and sends the verifier back', async () => {
    const idp = fakeIdp('https://accounts.google.test');
    const provider = new GoogleProvider('client-1', 'secret-1', idp.endpoints, idp.fetcher);
    const url = new URL(provider.authorizeUrl({ state: 's', nonce: 'n', codeChallenge: 'c'.repeat(43), redirectUri: 'https://site/cb' }));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-1',
      scope: 'openid email profile',
      code_challenge_method: 'S256',
      response_type: 'code',
      redirect_uri: 'https://site/cb',
    });
    const { code } = idp.approve(url.toString(), { sub: 'g-1', email: 'a@b.co', email_verified: true, name: 'Ali' });
    await expect(provider.profile({ code, codeVerifier: 'v'.repeat(50), nonce: 'n', redirectUri: 'https://site/cb' })).resolves.toEqual({
      subject: 'g-1',
      email: 'a@b.co',
      emailVerified: true,
      name: 'Ali',
    });
    expect(idp.tokenRequests[0].get('code_verifier')).toBe('v'.repeat(50));
    expect(idp.tokenRequests[0].get('client_secret')).toBe('secret-1');
  });

  it('signs Apple client secrets with the .p8 key and reads the name Apple posts once', async () => {
    const idp = fakeIdp('https://appleid.test');
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const provider = new AppleProvider({ clientId: 'com.example.web', teamId: 'TEAM123', keyId: 'KEY123', privateKey }, idp.endpoints, idp.fetcher);

    const secret = provider.clientSecret();
    const [header, claims, signature] = secret.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({ iss: 'TEAM123', sub: 'com.example.web', aud: 'https://appleid.apple.com' });
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(provider.clientSecret()).toBe(secret);

    const url = provider.authorizeUrl({ state: 's', nonce: 'n', codeChallenge: 'x', redirectUri: 'https://site/cb' });
    expect(new URL(url).searchParams.get('response_mode')).toBe('form_post');
    const { code } = idp.approve(url, { sub: 'apple-1', email: 'x1y2@privaterelay.appleid.com', email_verified: 'true' });
    const user = JSON.stringify({ name: { firstName: 'Ayesha', lastName: 'Malik' }, email: 'x1y2@privaterelay.appleid.com' });
    await expect(provider.profile({ code, codeVerifier: '', nonce: 'n', redirectUri: 'https://site/cb', user })).resolves.toEqual({
      subject: 'apple-1',
      email: 'x1y2@privaterelay.appleid.com',
      emailVerified: true,
      name: 'Ayesha Malik',
    });
  });
});

describe('OAuthService', () => {
  it('creates a verified, password-less account and needs the app verifier to finish', async () => {
    const { service, users, identities, signIn } = setup();
    const { outcome, verifier } = await signIn(GOOGLE_PERSON);
    expect(outcome).toEqual({ client: 'web', code: expect.any(String) });
    expect(service.webUrl(outcome)).toBe(`https://resume.example.com/auth/callback?code=${outcome.code}`);
    expect(users[0]).toMatchObject({ email: 'sara.khan@gmail.com', fullName: 'Sara Khan', passwordHash: null, emailVerifiedAt: expect.any(Date) });
    expect(identities[0]).toMatchObject({ provider: 'google', subject: 'google-123', userId: users[0].id });

    await expect(service.exchange(outcome.code!, verifier)).resolves.toMatchObject({ accessToken: `token-for-${users[0].id}`, notice: null });
    // One use only.
    await expect(service.exchange(outcome.code!, verifier)).rejects.toMatchObject({ response: { code: 'OAUTH_EXPIRED' } });
  });

  it('refuses a stolen callback code without the verifier, and burns it', async () => {
    const { service, signIn } = setup();
    const { outcome, verifier } = await signIn(GOOGLE_PERSON);
    await expect(service.exchange(outcome.code!, randomBytes(32).toString('base64url'))).rejects.toMatchObject({ response: { code: 'OAUTH_INVALID' } });
    await expect(service.exchange(outcome.code!, verifier)).rejects.toMatchObject({ response: { code: 'OAUTH_EXPIRED' } });
  });

  it('still asks for the two-factor code after Google / Apple, unless the device is remembered', async () => {
    const { service, users, signIn, auth } = setup();
    users.push({ id: 'u7', email: 'sara.khan@gmail.com', fullName: 'Sara', passwordHash: null, emailVerifiedAt: new Date(), twoFactorEnabledAt: new Date(), tokenVersion: 0 } as User);
    let leg = await signIn(GOOGLE_PERSON);
    await expect(service.exchange(leg.outcome.code!, leg.verifier)).resolves.toMatchObject({ twoFactorRequired: true, challenge: 'challenge-for-u7', created: false });
    leg = await signIn(GOOGLE_PERSON);
    await expect(service.exchange(leg.outcome.code!, leg.verifier, ['trusted-device'])).resolves.toMatchObject({ accessToken: 'token-for-u7' });
    expect(auth.sessionOrChallenge).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'u7' }), ['trusted-device']);
  });

  it('marks brand-new accounts so the app skips the two-factor offer right after sign-up', async () => {
    const { service, signIn } = setup();
    const { outcome, verifier } = await signIn(GOOGLE_PERSON);
    await expect(service.exchange(outcome.code!, verifier)).resolves.toMatchObject({ created: true });
  });

  it('signs a returning person into the same account', async () => {
    const { users, signIn } = setup();
    await signIn(GOOGLE_PERSON);
    const again = await signIn({ ...GOOGLE_PERSON, email: 'sara.new@gmail.com' });
    expect(again.outcome.code).toBeTruthy();
    expect(users).toHaveLength(1);
  });

  it('links an unverified email + password account, removing that password and its sessions', async () => {
    const { store, users, signIn, service } = setup();
    users.push({ id: 'u9', email: 'sara.khan@gmail.com', fullName: 'Sara', passwordHash: '$2b$11$squatter', emailVerifiedAt: null, tokenVersion: 0 } as User);
    const { outcome, verifier } = await signIn(GOOGLE_PERSON);
    expect(users[0]).toMatchObject({ passwordHash: null, emailVerifiedAt: expect.any(Date), tokenVersion: 1 });
    expect(store.revokeSessions).toHaveBeenCalledWith('u9');
    expect(store.create).not.toHaveBeenCalled();
    await expect(service.exchange(outcome.code!, verifier)).resolves.toMatchObject({ notice: 'password_removed' });
  });

  it('keeps the password of an account whose email was already verified', async () => {
    const { store, users, signIn } = setup();
    users.push({ id: 'u9', email: 'sara.khan@gmail.com', fullName: 'Sara', passwordHash: '$2b$11$mine', emailVerifiedAt: new Date(), tokenVersion: 0 } as User);
    await signIn(GOOGLE_PERSON);
    expect(users[0].passwordHash).toBe('$2b$11$mine');
    expect(store.revokeSessions).not.toHaveBeenCalled();
  });

  it('refuses unverified or missing emails, and reports cancellations and expired states', async () => {
    const { service, signIn } = setup();
    expect((await signIn({ ...GOOGLE_PERSON, email_verified: false })).outcome.error).toBe('email_unverified');
    expect((await signIn({ ...GOOGLE_PERSON, sub: 'other', email: undefined })).outcome.error).toBe('no_email');

    const { state } = await signIn(GOOGLE_PERSON);
    expect(await service.callback('google', { code: 'x', state }, IP)).toEqual({ client: 'web', error: 'expired' });

    const challenge = createHash('sha256').update('v'.repeat(43)).digest('base64url');
    const url = new URL(service.start('google', 'web', challenge));
    expect(await service.callback('google', { error: 'access_denied', state: url.searchParams.get('state')! }, IP)).toEqual({
      client: 'web',
      error: 'cancelled',
    });
  });

  it('turns away unknown providers and malformed challenges', () => {
    const { service } = setup();
    expect(service.start('apple', 'web', 'a'.repeat(43))).toBe('https://resume.example.com/auth/callback?error=unavailable');
    expect(service.start('google', 'web', 'too-short')).toBe('https://resume.example.com/auth/callback?error=unavailable');
  });

  it('sends the Android app back through its deep link', async () => {
    const { service, signIn } = setup();
    const { outcome } = await signIn(GOOGLE_PERSON, 'app');
    expect(outcome.client).toBe('app');
    const page = service.appPage(outcome);
    expect(page.html).toContain(`com.resumestudio.app://oauth?code=${outcome.code}`);
    expect(page.csp).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
  });

  it('makes a display name from the email when the provider gives none', () => {
    expect(displayName(null, 'sara.khan@gmail.com')).toBe('Sara Khan');
    expect(displayName('Visit www.spam.test', 'ali_raza+cv@x.com')).toBe('Ali Raza Cv');
    expect(displayName(null, '12345@x.com')).toBe('ResumeStudio user');
  });
});
