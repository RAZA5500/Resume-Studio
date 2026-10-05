import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import type { CheckoutConfig, CheckoutOrder } from '../models/app.models';

/**
 * Online checkout through the payment gateway (the primary way to pay). The QR code with manual
 * approval goes through BillingService.submitPayment.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly http = inject(HttpClient);

  readonly config = signal<CheckoutConfig | null>(null);
  /** The online gateway, or null while it is not connected yet. */
  readonly gateway = computed(() => this.config()?.gateway ?? null);
  readonly loaded = signal(false);
  private loading = false;

  load(): void {
    if (this.config() || this.loading) return;
    this.loading = true;
    this.http.get<CheckoutConfig>('/api/checkout/config').subscribe({
      next: (config) => {
        this.config.set(config);
        this.loaded.set(true);
        this.loading = false;
      },
      error: () => {
        // Without it the checkout still works: it offers the QR code only.
        this.loaded.set(true);
        this.loading = false;
      },
    });
  }

  /** Creates an order and its gateway session; open payUrl next. */
  createOrder(): Observable<{ order: CheckoutOrder; payUrl: string }> {
    return this.http.post<{ order: CheckoutOrder; payUrl: string }>('/api/checkout/orders', {});
  }

  order(id: string): Observable<CheckoutOrder> {
    return this.http.get<CheckoutOrder>(`/api/checkout/orders/${encodeURIComponent(id)}`);
  }

  /**
   * Leaves for the gateway's payment page. In the Android app this opens the phone's browser (the
   * web view hands other sites over to it); the gateway then returns the buyer to the website's
   * result page, and the app picks up the new plan when it comes back to the front.
   */
  openPaymentPage(payUrl: string): void {
    window.location.assign(payUrl);
  }
}
