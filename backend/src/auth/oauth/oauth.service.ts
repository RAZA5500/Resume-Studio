import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { siteUrlFrom } from '../../common/site-url.js';
import type { IdentityProvider } from '../../users/user-identity.entity.js';
import type { User } from '../../users/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import { type AuthResponse, AuthService } from '../auth.service.js';
import { AuthAttemptsService, maskEmail, TooManyAttemptsException } from '../security/auth-attempts.service.js';
import type { TwoFactorChallenge } from '../two-factor/two-factor.service.js';
import type { OAuthProfile, OAuthProvider } from './oauth-providers.js';

/** Injection token: the configured providers (see createOAuthProviders). */
export const OAUTH_PROVIDERS = Symbol('OAUTH_PROVIDERS');

/** Where the sign-in started: the website, or the Android app (which gets the result through a deep link). */
export type OAuthClient = 'web' | 'app';
export type OAuthErrorCode = 'cancelled' | 'expired' | 'failed' | 'email_unverified' | 'no_email' | 'unavailable' | 'too_many';
/** Shown once after signing in: the password set before on this email was turned off. */
export type OAuthNotice = 'password_removed' | null;

export interface OAuthOutcome {
  client: OAuthClient;
  code?: string;
  error?: OAuthErrorCode;
}

/** The Android app's deep link (android/app/src/main/AndroidManifest.xml). */
export const APP_RETURN_URL = 'com.resumestudio.app://oauth';

const FLOW_MS = 10 * 60_000;
const CODE_MS = 2 * 60_000;
/** base64url SHA-256 (43 characters): the app's PKCE challenge for the final exchange. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const PLAIN_NAME = /^(?![\s\S]*(?:https?:\/\/|www\.|[<>]))[\s\S]*$/i;

interface PendingSignIn {
  provider: IdentityProvider;
  client: OAuthClient;
  clientChallenge: string;
  nonce: string;
  codeVerifier: string;
  expires: number;
}

interface LoginCode {
  userId: string;
  clientChallenge: string;
  notice: OAuthNotice;
  /** A new account (the app does not offer two-factor setup right after sign-up). */
  created: boolean;
  expires: number;
}

class OAuthRefusal extends Error {
  constructor(readonly code: OAuthErrorCode) {
    super(code);
  }
}

const random = (bytes: number) => randomBytes(bytes).toString('base64url');
const s256 = (value: string) => createHash('sha256').update(value).digest('base64url');

function field(source: Record<string, unknown>, name: string): string | undefined {
  const value = source[name];
  return typeof value === 'string' && value ? value : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Sign in / sign up with Google and Apple (OpenID Connect authorization code flow).
 *
 * 1. GET oauth/:provider/start — the app sends a PKCE challenge of its own; we remember it with a
 *    single-use state, a nonce and (Google) our PKCE verifier, and send the browser to the provider.
 * 2. The provider returns to oauth/:provider/callback. We exchange the code server-to-server,
 *    verify the ID token (signature, issuer, audience, expiry, nonce), and find, link or create the
 *    account. The browser then gets a one-time code (2 minutes), never a login token.
 * 3. POST oauth/exchange — the app trades that code plus its PKCE verifier for the session. Only
 *    the app that started the sign-in holds the verifier, so a stolen or planted callback link is
 *    worthless (no login CSRF, no deep-link interception on Android).
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger('Auth');
  private readonly pending = new Map<string, PendingSignIn>();
  private readonly codes = new Map<string, LoginCode>();
  private lastPrune = 0;
  readonly siteUrl: string;

  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly attempts: AuthAttemptsService,
    @Inject(OAUTH_PROVIDERS) private readonly providers: Map<IdentityProvider, OAuthProvider>,
    config: ConfigService,
  ) {
    this.siteUrl = siteUrlFrom(config);
  }

  /** Which buttons the sign-in page shows. */
  enabled(): Record<IdentityProvider, boolean> {
    return { google: this.providers.has('google'), apple: this.providers.has('apple') };
  }

  /** Step 1: the provider's sign-in page, or our error page when the request is not usable. */
  start(providerKey: string, client: string, challenge: string | undefined): string {
    const provider = this.providers.get(providerKey as IdentityProvider);
    const target: OAuthClient = client === 'app' ? 'app' : 'web';
    if (!provider || !challenge || !CHALLENGE.test(challenge)) return this.webUrl({ client: 'web', error: 'unavailable' });

    this.prune();
    const state = random(32);
    const flow: PendingSignIn = {
      provider: provider.key,
      client: target,
      clientChallenge: challenge,
      nonce: random(32),
      codeVerifier: random(48),
      expires: Date.now() + FLOW_MS,
    };
    this.pending.set(state, flow);
    return provider.authorizeUrl({
      state,
      nonce: flow.nonce,
      codeChallenge: s256(flow.codeVerifier),
      redirectUri: this.redirectUri(provider.key),
    });
  }

  /** Step 2: what the provider sent back (query string for Google, posted form for Apple). */
  async callback(providerKey: string, params: Record<string, unknown>, ip: string): Promise<OAuthOutcome> {
    const state = field(params, 'state');
    const flow = state ? this.pending.get(state) : undefined;
    if (state) this.pending.delete(state);
    if (!flow || flow.expires < Date.now() || flow.provider !== providerKey) return { client: flow?.client ?? 'web', error: 'expired' };

    const providerError = field(params, 'error');
    if (providerError) {
      const cancelled = providerError === 'access_denied' || providerError === 'user_cancelled_authorize';
      return { client: flow.client, error: cancelled ? 'cancelled' : 'failed' };
    }
    const provider = this.providers.get(flow.provider);
    const code = field(params, 'code');
    if (!provider || !code) return { client: flow.client, error: provider ? 'failed' : 'unavailable' };

    try {
      const profile = await provider.profile({
        code,
        codeVerifier: flow.codeVerifier,
        nonce: flow.nonce,
        redirectUri: this.redirectUri(provider.key),
        user: params.user,
      });
      const { user, notice, created } = await this.resolveAccount(provider, profile, ip);
      this.prune();
      const loginCode = random(32);
      this.codes.set(loginCode, { userId: user.id, clientChallenge: flow.clientChallenge, notice, created, expires: Date.now() + CODE_MS });
      return { client: flow.client, code: loginCode };
    } catch (error) {
      if (error instanceof OAuthRefusal) return { client: flow.client, error: error.code };
      if (error instanceof TooManyAttemptsException) return { client: flow.client, error: 'too_many' };
      this.logger.warn(`${provider.name} sign-in failed: ${(error as Error).message}`);
      return { client: flow.client, error: 'failed' };
    }
  }

  /** Step 3: the one-time code plus the app's PKCE verifier become a session. */
  async exchange(
    code: string,
    verifier: string,
    devices?: readonly string[],
  ): Promise<(AuthResponse | TwoFactorChallenge) & { notice: OAuthNotice; created: boolean }> {
    const entry = this.codes.get(code);
    // Single use, also when the verifier is wrong: a guessed verifier gets one try.
    this.codes.delete(code);
    if (!entry || entry.expires < Date.now()) {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'OAUTH_EXPIRED', message: 'This sign-in has expired. Please try again.' });
    }
    if (s256(verifier) !== entry.clientChallenge) {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'OAUTH_INVALID', message: 'This sign-in could not be completed. Please try again.' });
    }
    const user = await this.users.findById(entry.userId);
    // With two-factor sign-in on, Google / Apple only replace the password: the code is still asked.
    const next = await this.auth.sessionOrChallenge(user, devices);
    return { ...next, notice: entry.notice, created: entry.created };
  }

  /** Where the website shows the result (/auth/callback reads code or error). */
  webUrl(outcome: OAuthOutcome): string {
    const query = outcome.code ? `code=${encodeURIComponent(outcome.code)}` : `error=${outcome.error ?? 'failed'}`;
    return `${this.siteUrl}/auth/callback?${query}`;
  }

  /** The Android app's page: opens the app through its deep link, with a button in case the browser asks first. */
  appPage(outcome: OAuthOutcome): { html: string; csp: string } {
    const link = `${APP_RETURN_URL}?${outcome.code ? `code=${encodeURIComponent(outcome.code)}` : `error=${outcome.error ?? 'failed'}`}`;
    const nonce = random(16);
    const title = outcome.code ? 'You are signed in' : 'Sign-in did not finish';
    return {
      csp: `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · ResumeStudio</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font:16px/1.5 system-ui,sans-serif;background:#0a0c10;color:#f3f5f8;text-align:center}
a{display:inline-block;margin-top:18px;padding:13px 22px;border-radius:12px;background:#2563eb;color:#fff;font-weight:700;text-decoration:none}p{color:#a3acb9}</style></head>
<body><main><h1>${title}</h1><p>Continue in the ResumeStudio app.</p><a href="${escapeHtml(link)}">Open ResumeStudio</a></main>
<script nonce="${nonce}">location.href = ${JSON.stringify(link)};</script></body></html>`,
    };
  }

  private redirectUri(provider: IdentityProvider): string {
    return `${this.siteUrl}/api/auth/oauth/${provider}/callback`;
  }

  /**
   * Finds the account for this provider account, links it to the account with the same (verified)
   * email, or creates a new one. An email + password account that nobody ever verified loses its
   * password and other sessions when the email's verified owner signs in: otherwise whoever created
   * it with someone else's address (a "pre-hijacked" account) would keep access.
   */
  private async resolveAccount(provider: OAuthProvider, profile: OAuthProfile, ip: string, retried = false): Promise<{ user: User; notice: OAuthNotice; created: boolean }> {
    const email = profile.email?.trim().toLowerCase() || null;
    const known = await this.users.findIdentity(provider.key, profile.subject);
    if (known) {
      await this.users.touchIdentity(known, email);
      this.logger.log(`${provider.name} sign-in for ${maskEmail(email ?? 'unknown')}.`);
      return { user: await this.users.findById(known.userId), notice: null, created: false };
    }
    if (!email) throw new OAuthRefusal('no_email');
    if (!profile.emailVerified) throw new OAuthRefusal('email_unverified');

    try {
      const existing = await this.users.findByEmail(email, true);
      if (existing) {
        let notice: OAuthNotice = null;
        if (existing.passwordHash && !existing.emailVerifiedAt) {
          // Whoever set up this account with an unverified address also chose its 2FA app: that goes too.
          await this.users.update(existing.id, {
            passwordHash: null,
            emailVerifiedAt: new Date(),
            twoFactorSecret: null,
            twoFactorEnabledAt: null,
            twoFactorLastStep: null,
            twoFactorBackupCodes: null,
          });
          await this.users.revokeSessions(existing.id);
          notice = 'password_removed';
        } else if (!existing.emailVerifiedAt) {
          await this.users.update(existing.id, { emailVerifiedAt: new Date() });
        }
        await this.users.linkIdentity(existing.id, provider.key, profile.subject, email);
        this.logger.log(`${provider.name} linked to ${maskEmail(email)}${notice ? ' (unverified password removed)' : ''}.`);
        return { user: await this.users.findById(existing.id), notice, created: false };
      }

      this.attempts.assertSignupAllowed(ip);
      const user = await this.users.create({ email, fullName: displayName(profile.name, email), passwordHash: null, emailVerifiedAt: new Date() });
      await this.users.linkIdentity(user.id, provider.key, profile.subject, email);
      this.attempts.signupCreated(ip);
      this.logger.log(`New account ${maskEmail(email)} via ${provider.name} from ${ip}.`);
      return { user, notice: null, created: true };
    } catch (error) {
      // Two callbacks for the same person at once: the unique indexes decide, then we look again.
      const code = (error as { driverError?: { code?: string }; code?: string }).driverError?.code ?? (error as { code?: string }).code;
      if (code === '23505' && !retried) return this.resolveAccount(provider, profile, ip, true);
      throw error;
    }
  }

  /** Forgets expired sign-ins and codes (at most once a minute) and caps both maps. */
  private prune(): void {
    const now = Date.now();
    if (now - this.lastPrune < 60_000 && this.pending.size < 10_000 && this.codes.size < 10_000) return;
    this.lastPrune = now;
    for (const map of [this.pending, this.codes] as Map<string, { expires: number }>[]) {
      for (const [key, entry] of map) if (entry.expires < now) map.delete(key);
      for (const key of map.keys()) {
        if (map.size < 10_000) break;
        map.delete(key);
      }
    }
  }
}

/** The provider's name, cleaned; otherwise one made from the email ("sara.khan@…" → "Sara Khan"). */
export function displayName(name: string | null, email: string): string {
  const cleaned = (name ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (cleaned.length >= 2 && PLAIN_NAME.test(cleaned)) return cleaned;
  const fromEmail = email
    .split('@')[0]
    .split(/[._+-]+/)
    .filter((part) => /^\p{L}/u.test(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 120);
  return fromEmail.length >= 2 ? fromEmail : 'ResumeStudio user';
}
