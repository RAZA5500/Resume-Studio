import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import type { AuthResponse, User } from '../models/app.models';

const TOKEN_KEY = 'rs_token';
const USER_KEY = 'rs_user';

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

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(tap((r) => this.setSession(r)));
  }

  register(fullName: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/register', { fullName, email, password })
      .pipe(tap((r) => this.setSession(r)));
  }

  refreshProfile(): Observable<User> {
    return this.http.get<User>('/api/auth/me').pipe(tap((u) => this.setUser(u)));
  }

  updateProfile(patch: { fullName?: string; headline?: string }): Observable<User> {
    return this.http.patch<User>('/api/auth/me', patch).pipe(tap((u) => this.setUser(u)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ success: true }> {
    return this.http.post<{ success: true }>('/api/auth/change-password', { currentPassword, newPassword });
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

  private setSession(response: AuthResponse): void {
    this.token.set(response.accessToken);
    write(TOKEN_KEY, response.accessToken);
    this.setUser(response.user);
  }

  private setUser(user: User): void {
    this.user.set(user);
    write(USER_KEY, JSON.stringify(user));
  }
}
