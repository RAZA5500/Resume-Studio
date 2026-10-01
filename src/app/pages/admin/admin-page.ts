import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AdminStats, AdminUser, PaymentRecord, PaymentStatus, Plan } from '../../core/models/app.models';
import { AuthService } from '../../core/services/auth.service';
import { BillingService, METHOD_LABELS } from '../../core/services/billing.service';
import { DialogService, ToastService } from '../../core/services/ui.service';
import { errorMessage, errorMessageAsync } from '../../core/utils/http';
import { CountUp } from '../../shared/motion/count-up';

type StatusFilter = PaymentStatus | 'all';

@Component({
  selector: 'app-admin-page',
  imports: [FormsModule, DatePipe, CountUp],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly methodLabels = METHOD_LABELS;
  protected readonly filters: { key: StatusFilter; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  protected readonly tab = signal<'payments' | 'users'>('payments');
  protected readonly stats = signal<AdminStats | null>(null);

  protected readonly status = signal<StatusFilter>('pending');
  protected readonly payments = signal<PaymentRecord[]>([]);
  protected readonly loadingPayments = signal(true);
  /** Id of the payment or user currently being updated. */
  protected readonly busy = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly loadingUsers = signal(false);
  private usersLoaded = false;

  protected readonly receipt = signal<{ url: string; payment: PaymentRecord } | null>(null);
  protected readonly selfId = computed(() => this.auth.user()?.id);

  constructor() {
    // Debounced user search.
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const term = this.search();
      if (this.tab() !== 'users') return;
      clearTimeout(timer);
      timer = setTimeout(() => this.loadUsers(term), this.usersLoaded ? 300 : 0);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      this.closeReceipt();
    });
  }

  ngOnInit(): void {
    this.loadStats();
    this.loadPayments();
  }

  protected setStatus(status: StatusFilter): void {
    if (this.status() === status) return;
    this.status.set(status);
    this.loadPayments();
  }

  protected reload(): void {
    this.loadStats();
    if (this.tab() === 'payments') this.loadPayments();
    else this.loadUsers(this.search());
  }

  protected async approve(payment: PaymentRecord): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: 'Approve payment?',
      message: `Confirm you received ${payment.currency} ${payment.amount} via ${this.methodLabels[payment.method]} (TID ${payment.transactionId}). ${payment.user?.email ?? 'This user'} will get lifetime access.`,
      confirmText: 'Approve & activate',
    });
    if (!ok) return;
    this.busy.set(payment.id);
    this.billing.approve(payment.id).subscribe({
      next: () => {
        this.toast.success('Payment approved — lifetime access activated');
        this.afterReview(payment.id);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected async reject(payment: PaymentRecord): Promise<void> {
    const note = await this.dialogs.prompt({
      title: 'Reject payment',
      message: 'The user will see this reason and can submit the payment again.',
      label: 'Reason',
      value: 'We could not find this transaction. Please check the transaction ID.',
      confirmText: 'Reject payment',
      danger: true,
    });
    if (note === null) return;
    this.busy.set(payment.id);
    this.billing.reject(payment.id, note.trim()).subscribe({
      next: () => {
        this.toast.success('Payment rejected');
        this.afterReview(payment.id);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected viewReceipt(payment: PaymentRecord): void {
    this.busy.set(payment.id);
    this.billing.screenshot(payment.id).subscribe({
      next: (blob) => {
        this.busy.set(null);
        this.closeReceipt();
        this.receipt.set({ url: URL.createObjectURL(blob), payment });
      },
      error: async (e: unknown) => {
        this.busy.set(null);
        this.toast.error(await errorMessageAsync(e));
      },
    });
  }

  protected closeReceipt(): void {
    const current = this.receipt();
    if (current) URL.revokeObjectURL(current.url);
    this.receipt.set(null);
  }

  protected async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    this.toast.success('Copied');
  }

  protected async setPlan(user: AdminUser, plan: Plan): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: plan === 'lifetime' ? 'Grant lifetime access?' : 'Revoke lifetime access?',
      message:
        plan === 'lifetime'
          ? `${user.email} will get unlimited resumes, cover letters and document edits.`
          : `${user.email} will go back to the free plan with daily limits.`,
      confirmText: plan === 'lifetime' ? 'Grant lifetime' : 'Revoke',
      danger: plan === 'free',
    });
    if (!ok) return;
    this.busy.set(user.id);
    this.billing.setPlan(user.id, plan).subscribe({
      next: () => {
        this.busy.set(null);
        this.users.update((list) =>
          list.map((u) =>
            u.id === user.id ? { ...u, plan, planActivatedAt: plan === 'lifetime' ? new Date().toISOString() : null } : u,
          ),
        );
        this.loadStats();
        if (user.id === this.selfId()) this.billing.refresh(true);
        this.toast.success(plan === 'lifetime' ? 'Lifetime access granted' : 'Lifetime access revoked');
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private afterReview(id: string): void {
    this.busy.set(null);
    if (this.status() === 'pending') this.payments.update((list) => list.filter((p) => p.id !== id));
    else this.loadPayments();
    this.loadStats();
  }

  private loadStats(): void {
    this.billing.stats().subscribe({ next: (stats) => this.stats.set(stats), error: (e: unknown) => this.fail(e) });
  }

  private loadPayments(): void {
    this.loadingPayments.set(true);
    const status = this.status();
    this.billing.payments(status).subscribe({
      next: (list) => {
        // Ignore responses for a filter the admin has already left.
        if (status !== this.status()) return;
        this.payments.set(list);
        this.loadingPayments.set(false);
      },
      error: (e: unknown) => {
        this.loadingPayments.set(false);
        this.fail(e);
      },
    });
  }

  private loadUsers(term: string): void {
    this.loadingUsers.set(true);
    this.billing.users(term).subscribe({
      next: (list) => {
        if (term !== this.search()) return;
        this.usersLoaded = true;
        this.users.set(list);
        this.loadingUsers.set(false);
      },
      error: (e: unknown) => {
        this.loadingUsers.set(false);
        this.fail(e);
      },
    });
  }

  private fail(error: unknown): void {
    this.busy.set(null);
    this.toast.error(errorMessage(error));
  }
}
