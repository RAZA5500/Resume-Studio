import { DatePipe, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { isNativeApp } from '../../core/native/platform';
import { BillingService, METHOD_LABELS } from '../../core/services/billing.service';
import { CheckoutService } from '../../core/services/checkout.service';
import { errorMessage } from '../../core/utils/http';
import { Logo } from '../../shared/ui/logo';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import { QrPayment } from './qr-payment';

type PayMethod = 'online' | 'qr';

/** What lifetime access includes (order summary). */
const FEATURES = [
  'Unlimited resumes',
  'Unlimited cover letters',
  'Unlimited document edits',
  'No watermark on downloads',
  'Every template, now and future',
];

/**
 * Checkout for lifetime access, outside the app shell. Online payment through the gateway is the
 * primary method (activates instantly); the merchant QR code with manual verification is the
 * additional one, and the only one until the gateway is connected.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [DatePipe, RouterLink, Logo, ThemeToggle, QrPayment],
  templateUrl: './checkout-page.html',
  styleUrl: './checkout-page.scss',
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(window:pageshow)': 'onPageShow($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPage implements OnInit {
  protected readonly billing = inject(BillingService);
  protected readonly checkout = inject(CheckoutService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly features = FEATURES;
  protected readonly methodLabels = METHOD_LABELS;
  protected readonly gateway = this.checkout.gateway;
  protected readonly price = computed(() => this.checkout.config()?.price ?? this.billing.price());
  protected readonly currency = computed(() => this.checkout.config()?.currency ?? 'PKR');
  /** Stops waiting for the plan summary (offline, server busy): the account's cached plan is used. */
  private readonly summaryTimedOut = signal(false);
  /** Plan and gateway are known, so the right state and method can be shown. */
  protected readonly ready = computed(
    () => this.checkout.loaded() && (!!this.billing.summary() || this.summaryTimedOut()),
  );

  private readonly picked = signal<PayMethod | null>(null);
  /** The buyer's choice; online by default whenever the gateway is connected. */
  protected readonly method = computed<PayMethod>(() => {
    const gateway = this.gateway();
    const picked = this.picked();
    if (picked === 'qr' || !gateway) return 'qr';
    return 'online';
  });

  protected readonly starting = signal(false);
  protected readonly payError = signal('');
  /** Android app: the payment continues in the phone's browser; this page waits for the result. */
  protected readonly openedOrder = signal<string | null>(null);

  protected readonly whatsappLink = computed(() => {
    const number = this.billing.config()?.supportWhatsapp?.replace(/\D/g, '');
    return number ? `https://wa.me/${number}` : null;
  });
  /** Progress shown above the page: paying, waiting for QR verification, or done. */
  protected readonly stage = computed<'pay' | 'verify' | 'done'>(() =>
    this.billing.isLifetime() ? 'done' : this.billing.pendingPayment() ? 'verify' : 'pay',
  );

  ngOnInit(): void {
    this.checkout.load();
    this.billing.loadConfig();
    this.billing.refresh(true);
    if (this.route.snapshot.queryParamMap.get('method') === 'qr') this.picked.set('qr');
    // While a QR payment is being verified (or an online payment runs in the phone's browser),
    // poll so the page turns into "you're all set" as soon as the plan changes.
    const timer = setInterval(() => {
      if (!this.billing.isLifetime() && (this.billing.pendingPayment() || this.openedOrder())) this.billing.refresh(true);
    }, 15_000);
    const fallback = setTimeout(() => this.summaryTimedOut.set(true), 5_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      clearTimeout(fallback);
    });
  }

  protected choose(method: PayMethod): void {
    if (method === 'online' && !this.gateway()) return;
    this.payError.set('');
    this.picked.set(method);
  }

  protected payOnline(): void {
    if (this.starting() || !this.gateway()) return;
    this.payError.set('');
    this.starting.set(true);
    this.checkout.createOrder().subscribe({
      next: ({ order, payUrl }) => {
        this.checkout.openPaymentPage(payUrl);
        if (isNativeApp()) {
          this.openedOrder.set(order.id);
          this.starting.set(false);
        }
        // On the web the page is leaving; "starting" keeps the button busy until it has.
      },
      error: (e: unknown) => {
        this.starting.set(false);
        if (e instanceof HttpErrorResponse && e.status === 400) this.billing.refresh(true);
        this.payError.set(errorMessage(e));
      },
    });
  }

  /** Coming back from the gateway in another tab or the phone's browser. */
  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible' && !this.billing.isLifetime()) this.billing.refresh(true);
  }

  /** The browser's back button from the gateway restores this page from its cache: unfreeze it. */
  protected onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return;
    this.starting.set(false);
    this.billing.refresh(true);
  }

  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigateByUrl('/app/dashboard');
  }
}
