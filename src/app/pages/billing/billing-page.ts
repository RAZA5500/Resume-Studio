import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BillingService, METHOD_LABELS, USAGE_LABELS } from '../../core/services/billing.service';
import { CheckoutService } from '../../core/services/checkout.service';
import { CountUp } from '../../shared/motion/count-up';

/** Plan, today's usage and payment status. Paying happens on the separate checkout page (/checkout). */
@Component({
  selector: 'app-billing-page',
  imports: [DatePipe, RouterLink, CountUp],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly billing = inject(BillingService);
  protected readonly checkout = inject(CheckoutService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly methodLabels = METHOD_LABELS;

  /** Decorative confetti on the lifetime card (fixed positions so nothing jumps). */
  protected readonly confetti = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 53 + 4) % 100,
    delay: (i % 6) * 0.35,
    r: (i * 47) % 360,
    color: ['#2563eb', '#0d9488', '#14b8a6', '#22d3ee', '#fbbf24', '#34d399'][i % 6],
  }));

  protected readonly payment = computed(() => this.billing.summary()?.payment ?? null);
  protected readonly rejected = computed(() => {
    const payment = this.payment();
    return payment?.status === 'rejected' ? payment : null;
  });
  protected readonly whatsappLink = computed(() => {
    const number = this.billing.config()?.supportWhatsapp?.replace(/\D/g, '');
    return number ? `https://wa.me/${number}` : null;
  });

  protected readonly usage = computed(() => {
    const summary = this.billing.summary();
    if (!summary) return [];
    return (['resume', 'cover_letter', 'document'] as const).map((kind) => {
      const used = summary.used[kind];
      const limit = summary.limits[kind];
      const unlimited = limit < 0;
      return {
        kind,
        label: USAGE_LABELS[kind],
        used,
        limitLabel: unlimited ? '∞' : String(limit),
        full: !unlimited && used >= limit,
        percent: unlimited ? 0 : limit === 0 ? 100 : Math.min(100, (used / limit) * 100),
      };
    });
  });

  ngOnInit(): void {
    this.billing.loadConfig();
    this.billing.refresh(true);
    this.checkout.load();
    // While a payment is being reviewed, poll so the page switches to "Lifetime" once it is approved.
    const timer = setInterval(() => {
      if (this.billing.pendingPayment()) this.billing.refresh(true);
    }, 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}
