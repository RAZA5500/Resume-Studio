import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Observable, tap } from 'rxjs';
import type {
  AdminStats,
  AdminUser,
  BillingConfig,
  BillingSummary,
  LimitReached,
  PaymentMethodInfo,
  PaymentRecord,
  PaymentStatus,
  Plan,
  UsageKind,
} from '../models/app.models';
import { AuthService } from './auth.service';

export const USAGE_LABELS: Record<UsageKind, string> = {
  resume: 'New resumes',
  cover_letter: 'Cover letters',
  document: 'Document edits',
};

export const METHOD_LABELS: Record<PaymentMethodInfo['key'], string> = {
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  bank: 'Bank app',
};

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly config = signal<BillingConfig | null>(null);
  readonly summary = signal<BillingSummary | null>(null);

  readonly plan = computed<Plan>(() => this.summary()?.plan ?? this.auth.user()?.plan ?? 'free');
  readonly isLifetime = computed(() => this.plan() === 'lifetime');
  readonly price = computed(() => this.config()?.price ?? this.summary()?.price ?? 99);
  readonly pendingPayment = computed(() => {
    const payment = this.summary()?.payment;
    return payment?.status === 'pending' ? payment : null;
  });

  private lastRefresh = 0;
  private readonly userId = computed(() => this.auth.user()?.id ?? null);

  constructor() {
    // Forget the previous account's plan and usage on logout or when another account logs in.
    effect(() => {
      this.userId();
      untracked(() => {
        this.summary.set(null);
        this.lastRefresh = 0;
      });
    });
  }

  loadConfig(): void {
    if (this.config()) return;
    this.http.get<BillingConfig>('/api/billing/config').subscribe({ next: (c) => this.config.set(c), error: () => undefined });
  }

  /** Reloads plan + today's usage (throttled unless forced). */
  refresh(force = false): void {
    if (!this.auth.isAuthenticated()) return;
    if (!force && Date.now() - this.lastRefresh < 5000) return;
    this.lastRefresh = Date.now();
    this.http.get<BillingSummary>('/api/billing/me').subscribe({
      next: (summary) => {
        this.summary.set(summary);
        const user = this.auth.user();
        if (user && user.plan !== summary.plan) this.auth.patchUser({ plan: summary.plan });
      },
      error: () => undefined,
    });
  }

  remaining(kind: UsageKind): number | null {
    const summary = this.summary();
    if (!summary || summary.plan === 'lifetime' || summary.limits[kind] < 0) return null;
    return Math.max(0, summary.limits[kind] - summary.used[kind]);
  }

  submitPayment(form: FormData): Observable<PaymentRecord> {
    return this.http.post<PaymentRecord>('/api/billing/payments', form).pipe(tap(() => this.refresh(true)));
  }

  // ------------------------------------------------------------------ admin
  stats(): Observable<AdminStats> {
    return this.http.get<AdminStats>('/api/admin/stats');
  }

  payments(status: PaymentStatus | 'all'): Observable<PaymentRecord[]> {
    return this.http.get<PaymentRecord[]>('/api/admin/payments', { params: new HttpParams().set('status', status) });
  }

  screenshot(id: string): Observable<Blob> {
    return this.http.get(`/api/admin/payments/${id}/screenshot`, { responseType: 'blob' });
  }

  approve(id: string, note?: string): Observable<PaymentRecord> {
    return this.http.post<PaymentRecord>(`/api/admin/payments/${id}/approve`, { note: note || undefined });
  }

  reject(id: string, note: string): Observable<PaymentRecord> {
    return this.http.post<PaymentRecord>(`/api/admin/payments/${id}/reject`, { note });
  }

  users(search = ''): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>('/api/admin/users', { params: new HttpParams().set('search', search) });
  }

  setPlan(id: string, plan: Plan): Observable<{ id: string; plan: Plan }> {
    return this.http.post<{ id: string; plan: Plan }>(`/api/admin/users/${id}/plan`, { plan });
  }
}

/** Drives the global "upgrade to lifetime" dialog. */
@Injectable({ providedIn: 'root' })
export class UpgradeService {
  readonly reason = signal<Partial<LimitReached> | null>(null);

  show(reason: Partial<LimitReached> = {}): void {
    this.reason.set(reason);
  }

  close(): void {
    this.reason.set(null);
  }
}
