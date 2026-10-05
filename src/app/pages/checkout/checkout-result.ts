import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CheckoutOrder } from '../../core/models/app.models';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { CheckoutService } from '../../core/services/checkout.service';
import { Logo } from '../../shared/ui/logo';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

type ResultView = 'loading' | 'confirming' | 'missing' | CheckoutOrder['status'];

/** Poll every 3 s for two minutes, then every 10 s; stop after ten minutes. */
const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 10_000;
const FAST_FOR_MS = 120_000;
const GIVE_UP_MS = 600_000;
/** After this the page says it is taking longer than usual. */
const SLOW_AFTER_MS = 45_000;

/**
 * Where the gateway sends the buyer back (via the API, which has already verified the payment).
 * Public on purpose: in the Android app the payment runs in the phone's browser, which may not
 * be signed in — the order id in the link is enough to show its status.
 */
@Component({
  selector: 'app-checkout-result',
  imports: [DatePipe, RouterLink, Logo, ThemeToggle],
  templateUrl: './checkout-result.html',
  styleUrl: './checkout-result.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutResult implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);
  private readonly checkout = inject(CheckoutService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly order = signal<CheckoutOrder | null>(null);
  private readonly missing = signal(false);
  /** Still unconfirmed after a while. */
  protected readonly slow = signal(false);
  /** Polling stopped; the buyer can check again by hand. */
  protected readonly stopped = signal(false);

  protected readonly view = computed<ResultView>(() => {
    if (this.missing()) return 'missing';
    const order = this.order();
    if (!order) return 'loading';
    return order.status === 'created' ? 'confirming' : order.status;
  });
  protected readonly whatsappLink = computed(() => {
    const number = this.billing.config()?.supportWhatsapp?.replace(/\D/g, '');
    return number ? `https://wa.me/${number}` : null;
  });

  /** Decorative confetti on success (fixed positions so nothing jumps). */
  protected readonly confetti = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 53 + 4) % 100,
    delay: (i % 6) * 0.3,
    r: (i * 47) % 360,
    color: ['#2563eb', '#0d9488', '#14b8a6', '#22d3ee', '#fbbf24', '#34d399'][i % 6],
  }));

  private startedAt = Date.now();
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.billing.loadConfig();
    this.destroyRef.onDestroy(() => clearTimeout(this.timer));
    const id = this.route.snapshot.queryParamMap.get('order');
    if (id) this.load(id);
    else this.missing.set(true);
  }

  protected checkAgain(): void {
    const id = this.order()?.id;
    if (!id) return;
    clearTimeout(this.timer);
    this.startedAt = Date.now();
    this.slow.set(false);
    this.stopped.set(false);
    this.load(id);
  }

  private load(id: string): void {
    this.checkout.order(id).subscribe({
      next: (order) => {
        this.order.set(order);
        if (order.status === 'created') this.schedule(id);
        // The new plan shows up at once everywhere in the app (sidebar, limits, watermark).
        else if (order.status === 'paid' && this.auth.isAuthenticated()) this.billing.refresh(true);
      },
      error: (e: unknown) => {
        if (e instanceof HttpErrorResponse && (e.status === 400 || e.status === 404)) this.missing.set(true);
        else this.schedule(id); // offline or server busy: keep trying
      },
    });
  }

  private schedule(id: string): void {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed > SLOW_AFTER_MS) this.slow.set(true);
    if (elapsed > GIVE_UP_MS) {
      this.stopped.set(true);
      return;
    }
    this.timer = setTimeout(() => this.load(id), elapsed < FAST_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS);
  }
}
