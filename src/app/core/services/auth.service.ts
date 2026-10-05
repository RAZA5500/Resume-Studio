import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, from, map, Observable, switchMap, tap, throwError } from 'rxjs';
import type { AuthResponse, OAuthProvider, TwoFactorChallenge, TwoFactorSetup, User } from '../models/app.models';
import { isNativeApp } from '../native/platform';
import { type PowChallenge, sha256, solveChallenge } from '../utils/proof-of-work';
import { apiOrigin } from './api-url.interceptor';

const TOKEN_KEY = 'rs_token';
const USER_KEY = 'rs_user';
/** The API's security checks expire after 10 minutes; a solved one is used within 8. */
const PROOF_LIFETIME_MS = 8 * 60_000;
/** A Google / Apple sign-in in progress: the PKCE verifier and where to go afterwards. */
const OAUTH_KEY = 'rs_oauth';
const OAUTH_MAX_MS = 15 * 60_000;
/** "Remember this device" tokens for two-factor sign-in (a few accounts per device at most). */
const DEVICES_KEY = 'rs_devices';
/** Accounts that chose "don't ask again" for the two-factor offer after signing in. */
const OFFER_DISMISSED_KEY = 'rs_2fa_dismissed';

/** Where to continue after signing in (same as the log-in page's returnUrl / template). */
export interface AfterSignIn {
  returnUrl?: string;
  template?: string;
}

interface OAuthExtras {
  /** "password_removed": an unverified password on this email was turned off (see the API's OAuthService). */
  notice: 'password_removed' | null;
  /** A brand-new account (no two-factor offer right after sign-up). */
  created: boolean;
  after: AfterSignIn;
}

export type OAuthResult = (AuthResponse | TwoFactorChallenge) & OAuthExtras;

export function isTwoFactorChallenge(value: unknown): value is TwoFactorChallenge {
  return !!value && typeof value === 'object' && (value as TwoFactorChallenge).twoFactorRequired === true;
}

function readList(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Bytes(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  return globalThis.crypto?.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', data)) : sha256(data);
}

/** The API no longer accepts this security check (expired, used, or the server restarted). */
function proofRejected(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 400 && (error.error as { code?: string } | null)?.code === 'POW_INVALID';
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage may be unavailable (private mode) — the session then lives in memory only
  }
}

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return !!payload.exp && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(null);
  readonly user = signal<User | null>(null);
  /** The anti-bot check being solved for the next sign-in / sign-up. */
  private proof: { answer: Promise<string>; expires: number } | null = null;
  /** Which "Continue with …" buttons the server supports (null until loaded). */
  readonly oauthProviders = signal<Record<OAuthProvider, boolean> | null>(null);
  readonly isAuthenticated = computed(() => !!this.token());
  readonly firstName = computed(() => this.user()?.fullName.split(' ')[0] ?? '');
  readonly initials = computed(() =>
    (this.user()?.fullName ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join(''),
  );

  constructor() {
    const token = read(TOKEN_KEY);
    if (token && !tokenExpired(token)) {
      this.token.set(token);
      try {
        this.user.set(JSON.parse(read(USER_KEY) ?? 'null') as User | null);
      } catch {
        this.user.set(null);
      }
    } else if (token) {
      write(TOKEN_KEY, null);
      write(USER_KEY, null);
    }
  }

  /**
   * Starts the invisible anti-bot check (a small proof of work) in the background, so it is ready
   * by the time the sign-in or sign-up form is sent. The auth page calls it on open.
   */
  prepareProof(): void {
    if (this.proof && this.proof.expires > Date.now()) return;
    const answer = firstValueFrom(this.http.get<PowChallenge>('/api/auth/challenge')).then((challenge) => solveChallenge(challenge));
    const entry = { answer, expires: Date.now() + PROOF_LIFETIME_MS };
    // A failed fetch is not kept: the next attempt asks again.
    answer.catch(() => {
      if (this.proof === entry) this.proof = null;
    });
    this.proof = entry;
  }

  loadOAuthProviders(): void {
    if (this.oauthProviders()) return;
    this.http.get<Record<OAuthProvider, boolean>>('/api/auth/providers').subscribe({
      next: (providers) => this.oauthProviders.set(providers),
      error: () => this.oauthProviders.set({ google: false, apple: false }),
    });
  }

  /**
   * Leaves for Google / Apple. A random verifier stays on this device and only its hash goes along;
   * the API brings the browser back to /auth/callback with a one-time code that works only together
   * with the verifier (in the Android app the sign-in runs in the phone's browser and returns
   * through the app's deep link).
   */
  async startOAuth(provider: OAuthProvider, after: AfterSignIn = {}): Promise<void> {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(await sha256Bytes(verifier));
    write(OAUTH_KEY, JSON.stringify({ verifier, at: Date.now(), ...after }));
    const client = isNativeApp() ? 'app' : 'web';
    window.location.assign(`${apiOrigin()}/api/auth/oauth/${provider}/start?client=${client}&challenge=${challenge}`);
  }

  /** Trades the one-time code from /auth/callback (plus the kept verifier) for a session. */
  completeOAuth(code: string): Observable<OAuthResult> {
    type Pending = { verifier?: string; at?: number } & AfterSignIn;
    let pending: Pending | null;
    try {
      pending = JSON.parse(read(OAUTH_KEY) ?? 'null') as Pending | null;
    } catch {
      pending = null;
    }
    write(OAUTH_KEY, null);
    if (!pending?.verifier || !pending.at || Date.now() - pending.at > OAUTH_MAX_MS) {
      return throwError(() => new Error('This sign-in has expired. Please try again.'));
    }
    const after: AfterSignIn = { returnUrl: pending.returnUrl, template: pending.template };
    return this.http
      .post<(AuthResponse | TwoFactorChallenge) & Omit<OAuthExtras, 'after'>>('/api/auth/oauth/exchange', {
        code,
        verifier: pending.verifier,
        devices: readList(DEVICES_KEY),
      })
      .pipe(
        tap((r) => {
          if (!isTwoFactorChallenge(r)) this.setSession(r);
        }),
        map((r) => ({ ...r, after })),
      );
  }

  /**
   * A session — or, for accounts with two-factor sign-in on, a challenge that verifyTwoFactor()
   * completes. Remembered-device tokens go along so a trusted device skips the code.
   * `website` is the form's honeypot field: hidden from people, filled in only by bots.
   */
  login(email: string, password: string, website = ''): Observable<AuthResponse | TwoFactorChallenge> {
    return this.withProof((pow) =>
      this.http.post<AuthResponse | TwoFactorChallenge>('/api/auth/login', { email, password, website, pow, devices: readList(DEVICES_KEY) }),
    ).pipe(
      tap((r) => {
        if (!isTwoFactorChallenge(r)) this.setSession(r);
      }),
    );
  }

  /** Sign-in step two: the code from the authenticator app (or a backup code). */
  verifyTwoFactor(challenge: string, code: string, rememberDevice: boolean): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/2fa/verify', { challenge, code, rememberDevice }).pipe(
      tap((r) => {
        if (r.trustedDevice) write(DEVICES_KEY, JSON.stringify([r.trustedDevice, ...readList(DEVICES_KEY)].slice(0, 5)));
        this.setSession(r);
      }),
    );
  }

  // ---------------------------------------------------------------- two-factor setup (signed in)

  twoFactorSetup(): Observable<TwoFactorSetup> {
    return this.http.post<TwoFactorSetup>('/api/auth/2fa/setup', {});
  }

  twoFactorEnable(code: string): Observable<{ backupCodes: string[] }> {
    return this.http.post<{ backupCodes: string[] }>('/api/auth/2fa/enable', { code }).pipe(tap(() => this.patchUser({ twoFactorEnabled: true, backupCodesLeft: 10 })));
  }

  twoFactorDisable(code: string): Observable<unknown> {
    return this.http.post('/api/auth/2fa/disable', { code }).pipe(tap(() => this.patchUser({ twoFactorEnabled: false, backupCodesLeft: 0 })));
  }

  twoFactorBackupCodes(code: string): Observable<{ backupCodes: string[] }> {
    return this.http.post<{ backupCodes: string[] }>('/api/auth/2fa/backup-codes', { code }).pipe(tap(() => this.patchUser({ backupCodesLeft: 10 })));
  }

  /** After signing in, offer two-factor setup (optional) unless it is on or was dismissed on this device. */
  shouldOfferTwoFactor(): boolean {
    const user = this.user();
    return !!user && user.twoFactorEnabled === false && !readList(OFFER_DISMISSED_KEY).includes(user.id);
  }

  dismissTwoFactorOffer(): void {
    const user = this.user();
    if (user) write(OFFER_DISMISSED_KEY, JSON.stringify([user.id, ...readList(OFFER_DISMISSED_KEY)].slice(0, 20)));
  }

  register(fullName: string, email: string, password: string, website = ''): Observable<AuthResponse> {
    return this.withProof((pow) =>
      this.http.post<AuthResponse>('/api/auth/register', { fullName, email, password, website, pow }),
    ).pipe(tap((r) => this.setSession(r)));
  }

  refreshProfile(): Observable<User> {
    return this.http.get<User>('/api/auth/me').pipe(tap((u) => this.setUser(u)));
  }

  updateProfile(patch: { fullName?: string; headline?: string }): Observable<User> {
    return this.http.patch<User>('/api/auth/me', patch).pipe(tap((u) => this.setUser(u)));
  }

  /**
   * Other devices are signed out; this one continues with the fresh token the API returns.
   * Accounts made with Google / Apple set their first password without a current one.
   */
  changePassword(currentPassword: string | undefined, newPassword: string): Observable<{ success: true; accessToken?: string }> {
    return this.http
      .post<{ success: true; accessToken?: string }>('/api/auth/change-password', { currentPassword, newPassword })
      .pipe(
        tap((r) => {
          if (r.accessToken) this.setToken(r.accessToken);
        }),
      );
  }

  /** Ends every session of this account, on all devices (this one included). */
  logoutEverywhere(): Observable<unknown> {
    return this.http.post('/api/auth/logout-all', {}).pipe(tap(() => this.logout()));
  }

  /** Updates fields of the cached user (e.g. plan after a payment is approved). */
  patchUser(patch: Partial<User>): void {
    const user = this.user();
    if (user) this.setUser({ ...user, ...patch });
  }

  logout(redirect = true): void {
    this.token.set(null);
    this.user.set(null);
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    if (redirect) void this.router.navigateByUrl('/login');
  }

  /** A solved check for one request (each works only once). */
  private takeProof(): Promise<string> {
    this.prepareProof();
    const { answer } = this.proof!;
    this.proof = null;
    return answer;
  }

  /** Sends a public auth form with a fresh check; retries once if the API turned the check down. */
  private withProof<T>(send: (pow: string) => Observable<T>): Observable<T> {
    const attempt = () => from(this.takeProof()).pipe(switchMap(send));
    return attempt().pipe(
      catchError((error: unknown) => (proofRejected(error) ? attempt() : throwError(() => error))),
      // After a failed try (wrong password…), have the next check ready before the next click.
      tap({ error: () => this.prepareProof() }),
    );
  }

  private setSession(response: AuthResponse): void {
    this.setToken(response.accessToken);
    this.setUser(response.user);
  }

  private setToken(token: string): void {
    this.token.set(token);
    write(TOKEN_KEY, token);
  }

  private setUser(user: User): void {
    this.user.set(user);
    write(USER_KEY, JSON.stringify(user));
  }
}
