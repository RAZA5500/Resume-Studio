import { createPrivateKey, type KeyObject, sign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { IdentityProvider } from '../../users/user-identity.entity.js';
import { JwksKeys, verifyIdToken } from './id-token.js';

/** What a provider tells us about the person, after its ID token was verified. */
export interface OAuthProfile {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface AuthorizeRequest {
  state: string;
  nonce: string;
  /** PKCE S256 challenge for the provider (Google). */
  codeChallenge: string;
  redirectUri: string;
}

export interface CallbackData {
  code: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  /** Apple only: the "user" field it posts back on the first sign-in (name and email, as JSON). */
  user?: unknown;
}

export interface OAuthProvider {
  readonly key: IdentityProvider;
  readonly name: string;
  authorizeUrl(request: AuthorizeRequest): string;
  /** Exchanges the authorization code server-to-server and verifies the returned ID token. */
  profile(callback: CallbackData): Promise<OAuthProfile>;
}

export interface ProviderEndpoints {
  authorize: string;
  token: string;
  keys: string;
  issuers: string[];
}

export const GOOGLE_ENDPOINTS: ProviderEndpoints = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  keys: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
};

export const APPLE_ENDPOINTS: ProviderEndpoints = {
  authorize: 'https://appleid.apple.com/auth/authorize',
  token: 'https://appleid.apple.com/auth/token',
  keys: 'https://appleid.apple.com/auth/keys',
  issuers: ['https://appleid.apple.com'],
};

type Fetcher = typeof fetch;
const defaultFetch: Fetcher = (...args) => fetch(...args);

async function exchangeCode(url: string, form: Record<string, string>, fetcher: Fetcher): Promise<string> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
  if (!response.ok || typeof data.id_token !== 'string') {
    throw new Error(`Token exchange failed (HTTP ${response.status}${typeof data.error === 'string' ? `: ${data.error}` : ''})`);
  }
  return data.id_token;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const verified = (value: unknown) => value === true || value === 'true';

/** Sign in with Google (OpenID Connect, authorization code + PKCE). */
export class GoogleProvider implements OAuthProvider {
  readonly key = 'google' as const;
  readonly name = 'Google';
  private readonly keys: JwksKeys;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly endpoints: ProviderEndpoints = GOOGLE_ENDPOINTS,
    private readonly fetcher: Fetcher = defaultFetch,
  ) {
    this.keys = new JwksKeys(endpoints.keys, fetcher);
  }

  authorizeUrl({ state, nonce, codeChallenge, redirectUri }: AuthorizeRequest): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${this.endpoints.authorize}?${params}`;
  }

  async profile({ code, codeVerifier, nonce, redirectUri }: CallbackData): Promise<OAuthProfile> {
    const idToken = await exchangeCode(
      this.endpoints.token,
      {
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      },
      this.fetcher,
    );
    const claims = await verifyIdToken(idToken, this.keys, { issuers: this.endpoints.issuers, audience: this.clientId, nonce });
    return {
      subject: claims.sub as string,
      email: text(claims.email),
      emailVerified: verified(claims.email_verified),
      name: text(claims.name),
    };
  }
}

export interface AppleCredentials {
  /** The Services ID (not the app's bundle id). */
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: KeyObject;
}

/** Sign in with Apple (web flow: authorization code, posted back with response_mode=form_post). */
export class AppleProvider implements OAuthProvider {
  readonly key = 'apple' as const;
  readonly name = 'Apple';
  private readonly keys: JwksKeys;
  private secret?: { value: string; expires: number };

  constructor(
    private readonly credentials: AppleCredentials,
    private readonly endpoints: ProviderEndpoints = APPLE_ENDPOINTS,
    private readonly fetcher: Fetcher = defaultFetch,
  ) {
    this.keys = new JwksKeys(endpoints.keys, fetcher);
  }

  authorizeUrl({ state, nonce, redirectUri }: AuthorizeRequest): string {
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      // Apple only shares name and email with form_post.
      response_mode: 'form_post',
      scope: 'name email',
      state,
      nonce,
    });
    return `${this.endpoints.authorize}?${params}`;
  }

  async profile({ code, nonce, redirectUri, user }: CallbackData): Promise<OAuthProfile> {
    const idToken = await exchangeCode(
      this.endpoints.token,
      {
        code,
        client_id: this.credentials.clientId,
        client_secret: this.clientSecret(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      this.fetcher,
    );
    const claims = await verifyIdToken(idToken, this.keys, {
      issuers: this.endpoints.issuers,
      audience: this.credentials.clientId,
      nonce,
    });
    return {
      subject: claims.sub as string,
      email: text(claims.email),
      emailVerified: verified(claims.email_verified),
      name: appleName(user),
    };
  }

  /** Apple's client secret is a short-lived JWT signed (ES256) with the Sign in with Apple key. */
  clientSecret(now = Date.now()): string {
    if (this.secret && this.secret.expires > now + 60_000) return this.secret.value;
    const issuedAt = Math.floor(now / 1000);
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const input = `${encode({ alg: 'ES256', kid: this.credentials.keyId, typ: 'JWT' })}.${encode({
      iss: this.credentials.teamId,
      iat: issuedAt,
      exp: issuedAt + 3600,
      aud: 'https://appleid.apple.com',
      sub: this.credentials.clientId,
    })}`;
    const signature = sign('sha256', Buffer.from(input), { key: this.credentials.privateKey, dsaEncoding: 'ieee-p1363' });
    this.secret = { value: `${input}.${signature.toString('base64url')}`, expires: (issuedAt + 3600) * 1000 };
    return this.secret.value;
  }
}

/** Apple sends the person's name only on the very first sign-in, as JSON in the "user" form field. */
function appleName(user: unknown): string | null {
  if (typeof user !== 'string' || !user) return null;
  try {
    const { name } = JSON.parse(user) as { name?: { firstName?: unknown; lastName?: unknown } };
    return [text(name?.firstName), text(name?.lastName)].filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}

/**
 * The sign-in providers configured in the environment. Google needs GOOGLE_CLIENT_ID and
 * GOOGLE_CLIENT_SECRET; Apple needs APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID and
 * APPLE_PRIVATE_KEY (the .p8 key; "\n" escapes are fine). A provider without settings is off.
 */
export function createOAuthProviders(config: ConfigService, logger = new Logger('Auth')): Map<IdentityProvider, OAuthProvider> {
  const get = (key: string) => config.get<string>(key)?.trim() ?? '';
  const providers = new Map<IdentityProvider, OAuthProvider>();

  const google = { id: get('GOOGLE_CLIENT_ID'), secret: get('GOOGLE_CLIENT_SECRET') };
  if (google.id && google.secret) providers.set('google', new GoogleProvider(google.id, google.secret));
  else if (google.id || google.secret) logger.warn('Google sign-in is off: set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');

  const apple = { clientId: get('APPLE_CLIENT_ID'), teamId: get('APPLE_TEAM_ID'), keyId: get('APPLE_KEY_ID'), key: get('APPLE_PRIVATE_KEY') };
  const appleValues = Object.values(apple).filter(Boolean).length;
  if (appleValues === 4) {
    try {
      const privateKey = createPrivateKey(apple.key.replace(/\\n/g, '\n'));
      providers.set('apple', new AppleProvider({ clientId: apple.clientId, teamId: apple.teamId, keyId: apple.keyId, privateKey }));
    } catch (error) {
      logger.error(`Apple sign-in is off: APPLE_PRIVATE_KEY is not a valid .p8 key (${(error as Error).message}).`);
    }
  } else if (appleValues > 0) {
    logger.warn('Apple sign-in is off: set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY.');
  }

  logger.log(
    providers.size
      ? `Social sign-in: ${[...providers.values()].map((provider) => provider.name).join(' and ')}.`
      : 'Social sign-in is off (no Google or Apple credentials).',
  );
  return providers;
}
