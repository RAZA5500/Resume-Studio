import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, from, Observable, switchMap, tap, throwError } from 'rxjs';
import type { AuthResponse, User } from '../models/app.models';
import { type PowChallenge, solveChallenge } from '../utils/proof-of-work';

const TOKEN_KEY = 'rs_token';
const USER_KEY = 'rs_user';
/** The API's security checks expire after 10 minutes; a solved one is used within 8. */
const PROOF_LIFETIME_MS = 8 * 60_000;

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

  /** `website` is the form's honeypot field: hidden from people, filled in only by bots. */
  login(email: string, password: string, website = ''): Observable<AuthResponse> {
    return this.withProof((pow) => this.http.post<AuthResponse>('/api/auth/login', { email, password, website, pow })).pipe(
      tap((r) => this.setSession(r)),
    );
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

  /** Other devices are signed out; this one continues with the fresh token the API returns. */
  changePassword(currentPassword: string, newPassword: string): Observable<{ success: true; accessToken?: string }> {
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
