import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { PaymentMethodInfo } from '../../core/models/app.models';
import { AuthService } from '../../core/services/auth.service';
import { BillingService, METHOD_LABELS, USAGE_LABELS } from '../../core/services/billing.service';
import { ToastService } from '../../core/services/ui.service';
import { isNativeApp } from '../../core/native/platform';
import { compressImage, downloadBlob } from '../../core/utils/files';
import { errorMessage } from '../../core/utils/http';
import { CountUp } from '../../shared/motion/count-up';

const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/**
 * The merchant QR shown at checkout (JazzCash + Raast, so every wallet and bank app can scan it).
 * Images in public/payment/ come from `npm run payment-qr`; keep these details in step with them.
 */
const PAYMENT_QR = { merchant: 'RAZA Shop', tillId: '984636545', width: 906, height: 1280 };

@Component({
  selector: 'app-billing-page',
  imports: [FormsModule, DatePipe, RouterLink, CountUp],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
  host: { '(document:keydown.escape)': 'qrOpen.set(false)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly billing = inject(BillingService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly methodLabels = METHOD_LABELS;

  /** Decorative confetti on the lifetime card (fixed positions so nothing jumps). */
  protected readonly confetti = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 53 + 4) % 100,
    delay: (i % 6) * 0.35,
    r: (i * 47) % 360,
    color: ['#2563eb', '#0d9488', '#14b8a6', '#22d3ee', '#fbbf24', '#34d399'][i % 6],
  }));

  protected readonly qr = PAYMENT_QR;
  /** Enlarged QR (easier to scan from another phone). */
  protected readonly qrOpen = signal(false);

  /** "Paid with" choices: any of them can pay the QR code. */
  protected readonly methods: PaymentMethodInfo[] = (Object.keys(METHOD_LABELS) as PaymentMethodInfo['key'][]).map(
    (key) => ({ key, label: METHOD_LABELS[key] }),
  );
  protected readonly methodKey = signal<PaymentMethodInfo['key']>('jazzcash');
  protected readonly method = computed(() => this.methods.find((m) => m.key === this.methodKey()) ?? this.methods[0]);
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

  protected readonly transactionId = signal('');
  protected readonly senderNumber = signal('');
  protected readonly senderName = signal('');
  protected readonly screenshot = signal<File | null>(null);
  protected readonly screenshotUrl = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly formError = signal('');

  constructor() {
    // Frees the preview object URL whenever the screenshot changes or the page closes.
    effect((onCleanup) => {
      const url = this.screenshotUrl();
      onCleanup(() => {
        if (url) URL.revokeObjectURL(url);
      });
    });
  }

  ngOnInit(): void {
    this.billing.loadConfig();
    this.billing.refresh(true);
    // While a payment is being reviewed, poll so the page switches to "Lifetime" once it is approved.
    const timer = setInterval(() => {
      if (this.billing.pendingPayment()) this.billing.refresh(true);
    }, 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.toast.success('Copied');
    } catch {
      this.toast.info(value);
    }
  }

  /**
   * Saves the QR so someone paying on this phone can open it from their app's "Scan QR → Gallery".
   * The download is the JPEG original: every banking app's gallery scanner can read it.
   */
  protected async saveQr(): Promise<void> {
    try {
      const response = await fetch('payment/payment-qr.jpg');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Typed explicitly: some hosts send .jpg as application/octet-stream.
      const image = new Blob([await response.arrayBuffer()], { type: 'image/jpeg' });
      downloadBlob(image, 'ResumeStudio-payment-QR.jpg');
      // The Android app shows its own "saved" message and share sheet.
      if (!isNativeApp()) this.toast.success('QR saved. In your app tap Scan QR, then pick it from the gallery.');
    } catch {
      this.toast.error('Could not save the QR. Press and hold the image to save it instead.');
    }
  }

  protected async pickScreenshot(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    if (!picked) return;
    if (!SCREENSHOT_TYPES.includes(picked.type)) {
      this.toast.error('Please choose a PNG, JPG or WebP image.');
      return;
    }
    // Phone screenshots are often 1–3 MB PNGs; as WebP they upload in a fraction of the time.
    const file = await compressImage(picked);
    if (file.size > MAX_SCREENSHOT_BYTES) {
      this.toast.error('The screenshot must be smaller than 5 MB.');
      return;
    }
    this.screenshot.set(file);
    this.screenshotUrl.set(URL.createObjectURL(file));
  }

  protected clearScreenshot(): void {
    this.screenshot.set(null);
    this.screenshotUrl.set(null);
  }

  protected submit(): void {
    const method = this.method();
    if (!method || this.submitting()) return;
    this.formError.set('');
    const transactionId = this.transactionId().trim();
    const senderNumber = this.senderNumber().trim();
    if (!/^[A-Za-z0-9-]{6,40}$/.test(transactionId)) {
      this.formError.set('Enter the transaction ID (TID) exactly as shown on your receipt.');
      return;
    }
    if (!/^[A-Za-z0-9 +-]{7,34}$/.test(senderNumber)) {
      this.formError.set('Enter the mobile number or account number you paid from.');
      return;
    }

    const form = new FormData();
    form.append('method', method.key);
    form.append('transactionId', transactionId);
    form.append('senderNumber', senderNumber);
    if (this.senderName().trim()) form.append('senderName', this.senderName().trim());
    const screenshot = this.screenshot();
    if (screenshot) form.append('screenshot', screenshot);

    this.submitting.set(true);
    this.billing.submitPayment(form).subscribe({
      next: () => {
        this.submitting.set(false);
        this.transactionId.set('');
        this.senderNumber.set('');
        this.senderName.set('');
        this.clearScreenshot();
        this.toast.success('Payment submitted. We will activate your lifetime access after verifying it.');
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        this.formError.set(errorMessage(e));
      },
    });
  }
}
