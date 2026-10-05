import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { safeAppPath, SignInFlow } from '../../core/services/sign-in-flow';
import { ToastService } from '../../core/services/ui.service';
import { errorMessage } from '../../core/utils/http';
import { Logo } from '../../shared/ui/logo';

type Stage = 'code' | 'change' | 'link' | 'confirm-link' | 'verified' | 'link-failed';

/** How often the page checks whether the email was verified elsewhere (the link on another device). */
const POLL_MS = 5000;

function errorCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse ? (error.error as { code?: string } | null)?.code : undefined;
}

/** Seconds to wait after an HTTP 429 (lockout body, or the rate limiter's header). */
function retryAfterSeconds(error: unknown): number {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429) return 0;
  const fromBody = Number((error.error as { retryAfter?: unknown } | null)?.retryAfter);
  const seconds = Number.isFinite(fromBody) && fromBody > 0 ? fromBody : Number(error.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 24 * 3600) : 60;
}

/**
 * Email verification, after sign-up and at the first sign-in of older accounts. The email has a
 * 6-digit code (typed here) and a link (which opens this page with ?token=, on any device). While
 * waiting, the page notices a link clicked elsewhere and continues on its own.
 */
@Component({
  selector: 'app-verify-email-page',
  imports: [FormsModule, RouterLink, Logo],
  template: `
    <div class="wrap">
      <app-logo />
      <div class="card box" aria-live="polite">
        @switch (stage()) {
          @case ('link') {
            <span class="spinner lg"></span>
            <h1>Verifying your email…</h1>
            <p class="muted">Just a moment.</p>
          }

          @case ('confirm-link') {
            <span class="ic" aria-hidden="true"><span class="i">mail</span></span>
            <h1>Confirm your email</h1>
            <p class="muted">Confirm that <b>{{ linkEmail() }}</b> is your email address for ResumeStudio.</p>
            @if (error()) {
              <div class="alert danger"><span class="i">error</span><span>{{ error() }}</span></div>
            }
            <button class="btn btn-primary btn-lg btn-block" type="button" (click)="confirmLink()" [disabled]="busy()">
              @if (busy()) {
                <span class="spinner"></span>
              }
              Verify email
            </button>
          }

          @case ('verified') {
            <span class="ic ok" aria-hidden="true"><span class="i">verified</span></span>
            <h1>Email verified</h1>
            @if (canContinue()) {
              <p class="muted">Thanks! Taking you to ResumeStudio…</p>
              <button class="btn btn-primary btn-lg btn-block" type="button" (click)="continue()">
                Continue <span class="i">arrow_forward</span>
              </button>
            } @else if (!signedIn()) {
              <p class="muted"><b>{{ linkEmail() }}</b> is confirmed. Log in to start building your resume.</p>
              <a class="btn btn-primary btn-lg btn-block" routerLink="/login">Log in <span class="i">arrow_forward</span></a>
            } @else {
              <p class="muted"><b>{{ linkEmail() }}</b> is confirmed. You are signed in with another account that still needs its own email confirmed.</p>
              <button class="btn btn-primary btn-lg btn-block" type="button" (click)="openCode()">Continue</button>
            }
          }

          @case ('link-failed') {
            <span class="ic warn" aria-hidden="true"><span class="i">{{ linkExpired() ? 'schedule' : 'error' }}</span></span>
            <h1>{{ linkExpired() ? 'This link no longer works' : 'Could not verify right now' }}</h1>
            <p class="muted">{{ error() || 'The link has expired or was already used.' }}</p>
            @if (!linkExpired()) {
              <button class="btn btn-primary btn-lg btn-block" type="button" (click)="retryLink()" [disabled]="busy()">
                @if (busy()) {
                  <span class="spinner"></span>
                }
                Try again
              </button>
            } @else if (signedIn()) {
              <button class="btn btn-primary btn-lg btn-block" type="button" (click)="openCode()">Get a new code</button>
            } @else {
              <p class="small subtle">Log in and we will email you a new code.</p>
              <a class="btn btn-primary btn-lg btn-block" routerLink="/login">Log in</a>
            }
          }

          @case ('code') {
            <span class="ic" aria-hidden="true"><span class="i">mail</span></span>
            <h1>Check your email</h1>
            <p class="muted">
              Enter the 6-digit code we sent to <b class="addr">{{ email() }}</b>, or tap the link in that email.
            </p>
            <form class="stack full" (ngSubmit)="verify()" novalidate>
              <input #codeInput class="input code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••"
                aria-label="6-digit code" (input)="onCode(codeInput)" />
              @if (error()) {
                <div class="alert danger"><span class="i">error</span><span>{{ error() }}</span></div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy() || code().length !== 6">
                @if (busy()) {
                  <span class="spinner"></span>
                }
                Verify email
              </button>
            </form>

            <div class="resend">
              @if (sending()) {
                <span class="spinner"></span> Sending the email…
              } @else if (resendIn() > 0) {
                <span class="i sm">schedule</span> You can ask for a new code in {{ resendLabel() }}
              } @else {
                No email? Check Spam or Promotions, or
                <button class="link-btn" type="button" (click)="resend()"><span class="i sm">refresh</span> send a new code</button>
              }
            </div>

            <div class="links">
              <button class="link-btn" type="button" (click)="openChange()"><span class="i sm">edit</span> Wrong email?</button>
              <span aria-hidden="true">·</span>
              <button class="link-btn" type="button" (click)="logout()"><span class="i sm">logout</span> Log out</button>
            </div>
          }

          @case ('change') {
            <span class="ic" aria-hidden="true"><span class="i">edit</span></span>
            <h1>Change your email</h1>
            <p class="muted">Enter the right address and your password — we will send a new code there.</p>
            <form class="stack full left" (ngSubmit)="saveEmail()" novalidate>
              <div class="field">
                <label for="new-email">Email</label>
                <input id="new-email" class="input" type="email" name="email" autocomplete="email" placeholder="you@example.com"
                  [ngModel]="newEmail()" (ngModelChange)="newEmail.set($event)" />
              </div>
              <div class="field">
                <label for="current-password">Password</label>
                <input id="current-password" class="input" type="password" name="password" autocomplete="current-password" placeholder="••••••••"
                  [ngModel]="password()" (ngModelChange)="password.set($event)" />
              </div>
              @if (error()) {
                <div class="alert danger"><span class="i">error</span><span>{{ error() }}</span></div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
                @if (busy()) {
                  <span class="spinner"></span>
                }
                Save and send code
              </button>
            </form>
            <button class="btn btn-ghost btn-block" type="button" (click)="cancelChange()">Cancel</button>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 24px 16px; }
    .box { width: min(440px, 100%); padding: 30px 26px; display: flex; flex-direction: column; align-items: center; gap: 13px; text-align: center; animation: rise-in 0.45s var(--ease-out) both; }
    h1 { font-size: clamp(22px, 2.4vw, 26px); letter-spacing: -0.035em; }
    .ic { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 18px; color: #fff; background: var(--grad-brand); box-shadow: 0 16px 34px -14px rgba(37, 99, 235, 0.9); animation: pop-in 0.45s var(--ease-spring) both; }
    .ic.ok { background: var(--grad-mint); box-shadow: 0 16px 34px -14px rgba(16, 185, 129, 0.9); }
    .ic.warn { background: var(--grad-rose); box-shadow: 0 16px 34px -14px rgba(244, 63, 94, 0.8); }
    .ic .i { font-size: 30px; }
    .spinner.lg { color: var(--primary); }
    .addr { word-break: break-all; color: var(--text); }
    .full { align-self: stretch; }
    .left { text-align: left; }
    .code { height: 54px; font-family: var(--font-mono); font-size: 24px; letter-spacing: 0.4em; text-align: center; }
    .resend .spinner { width: 13px; height: 13px; }
    .resend { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 6px; font-size: 13px; color: var(--text-3); min-height: 22px; }
    .links { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-3); margin-top: 4px; }
    .link-btn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; border: 0; background: none; color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; }
    .link-btn:hover { text-decoration: underline; }
    .link-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 4px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly flow = inject(SignInFlow);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly toast = inject(ToastService);
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;

  /** Passed on by the log-in page and the guards: where to go once the email is confirmed. */
  private readonly after = {
    returnUrl: safeAppPath(this.params.get('returnUrl')),
    template: this.params.get('template') ?? undefined,
  };
  private readonly offerTwoFactor = this.params.get('offer') === '1';

  protected readonly stage = signal<Stage>('code');
  protected readonly signedIn = this.auth.isAuthenticated;
  protected readonly email = computed(() => this.auth.user()?.email ?? 'your email address');
  protected readonly canContinue = computed(() => this.signedIn() && !this.auth.mustVerifyEmail());
  protected readonly code = signal('');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  protected readonly busy = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  /** The (masked) address a link belongs to. */
  protected readonly linkEmail = signal('');
  /** The link failed because it expired or was used (not a passing network / server error). */
  protected readonly linkExpired = signal(true);
  protected readonly newEmail = signal('');
  protected readonly password = signal('');

  private linkToken = '';
  private continued = false;
  /** A status check is on its way (no overlapping requests on a slow connection). */
  private checking = false;
  private readonly resendAt = signal(0);
  private readonly clock = signal(Date.now());
  protected readonly resendIn = computed(() => Math.max(0, Math.ceil((this.resendAt() - this.clock()) / 1000)));
  protected readonly resendLabel = computed(() => {
    const seconds = this.resendIn();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
  private ticker?: ReturnType<typeof setInterval>;
  private poller?: ReturnType<typeof setInterval>;
  private continueTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Coming back from the mail app or another tab: check at once whether the link was used meanwhile.
    const onReturn = () => {
      if (!document.hidden) this.checkVerified();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      clearInterval(this.ticker);
      clearInterval(this.poller);
      clearTimeout(this.continueTimer);
    });
  }

  ngOnInit(): void {
    const token = this.params.get('token');
    if (token) {
      // The token works once; keep it out of the history and the address bar.
      this.location.replaceState('/verify-email');
      this.linkToken = token;
      this.stage.set('link');
      this.verifyLink(false);
      return;
    }
    if (!this.signedIn()) {
      void this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }
    this.openCode();
  }

  /** Shows the code form and emails a code (unless the one sent earlier still works). */
  protected openCode(): void {
    this.stage.set('code');
    this.error.set('');
    this.clearCode();
    this.sending.set(true);
    this.auth.sendVerificationEmail().subscribe({
      next: (result) => {
        this.sending.set(false);
        this.startResendTimer(result.retryAfter);
      },
      error: (e: unknown) => {
        this.sending.set(false);
        this.handleError(e);
      },
    });
    this.startPolling();
  }

  /** Digits only; the code is sent as soon as all six are there. */
  protected onCode(input: HTMLInputElement): void {
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value !== digits) input.value = digits;
    this.code.set(digits);
    if (digits.length === 6) this.verify();
  }

  /**
   * Empties the field directly: with signals, a code that goes '' → '123456' → '' between two
   * renders never reaches the template, so a binding would leave the old digits in the field.
   */
  private clearCode(focus = false): void {
    this.code.set('');
    const input = this.codeInput()?.nativeElement;
    if (!input) return;
    input.value = '';
    if (focus) input.focus();
  }

  protected verify(): void {
    if (this.busy()) return;
    if (!/^\d{6}$/.test(this.code())) {
      this.error.set('Enter the 6-digit code from the email.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.verifyEmailCode(this.code()).subscribe({
      next: (user) => {
        this.busy.set(false);
        if (!user.mustVerifyEmail) this.verified();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.clearCode(true);
        this.handleError(e);
      },
    });
  }

  protected resend(): void {
    if (this.sending() || this.resendIn() > 0) return;
    this.sending.set(true);
    this.error.set('');
    this.auth.resendVerificationEmail().subscribe({
      next: (result) => {
        this.sending.set(false);
        this.clearCode(true);
        this.startResendTimer(result.retryAfter);
        this.toast.success(`New code sent to ${this.email()}.`);
      },
      error: (e: unknown) => {
        this.sending.set(false);
        this.handleError(e);
      },
    });
  }

  protected openChange(): void {
    this.newEmail.set(this.auth.user()?.email ?? '');
    this.password.set('');
    this.error.set('');
    this.stage.set('change');
  }

  protected cancelChange(): void {
    this.error.set('');
    this.stage.set('code');
  }

  protected saveEmail(): void {
    if (this.busy()) return;
    const email = this.newEmail().trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Please enter a valid email address.');
    if (!this.password()) return this.error.set('Please enter your password.');
    this.busy.set(true);
    this.error.set('');
    this.auth.changeEmail(email, this.password()).subscribe({
      next: () => {
        this.busy.set(false);
        this.password.set('');
        this.resendAt.set(0);
        this.openCode();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  protected confirmLink(): void {
    if (!this.busy()) this.verifyLink(true);
  }

  protected retryLink(): void {
    if (!this.busy()) this.verifyLink(!!this.linkEmail());
  }

  protected logout(): void {
    this.auth.logout();
  }

  /** On to the template, the two-factor offer or the dashboard (see SignInFlow). */
  protected continue(): void {
    if (this.continued) return;
    this.continued = true;
    clearTimeout(this.continueTimer);
    this.flow.continue(this.after, { offerTwoFactor: this.offerTwoFactor, replaceUrl: true });
  }

  private verifyLink(confirm: boolean): void {
    this.busy.set(true);
    this.error.set('');
    this.auth.verifyEmailLink(this.linkToken, confirm).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.linkEmail.set(result.email);
        if (!result.verified) {
          this.stage.set('confirm-link');
          return;
        }
        this.stage.set('verified');
        // Signed in here: if it was this account's email, carry on.
        if (this.signedIn()) {
          this.auth.refreshProfile().subscribe({
            next: (user) => {
              if (!user.mustVerifyEmail) this.verified();
            },
            error: () => undefined,
          });
        }
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
        // A rejected link (expired, used, malformed) is final; anything else can be tried again.
        const rejected = e instanceof HttpErrorResponse && e.status === 400;
        this.linkExpired.set(rejected);
        this.stage.set('link-failed');
        // Opened a second time after it already worked: signed-in accounts that are verified just go on.
        if (rejected && this.signedIn()) {
          this.auth.refreshProfile().subscribe({
            next: (user) => {
              if (!user.mustVerifyEmail) this.verified();
            },
            error: () => undefined,
          });
        }
      },
    });
  }

  private verified(): void {
    clearInterval(this.poller);
    clearInterval(this.ticker);
    this.stage.set('verified');
    this.continueTimer = setTimeout(() => this.continue(), 1400);
  }

  private handleError(e: unknown): void {
    const code = errorCode(e);
    // Verified meanwhile (the link) or verification switched off: nothing left to do here.
    if (code === 'ALREADY_VERIFIED' || code === 'VERIFICATION_OFF') {
      this.checkVerified();
      return;
    }
    const wait = retryAfterSeconds(e);
    if (wait) this.startResendTimer(wait);
    this.error.set(errorMessage(e));
  }

  private startResendTimer(seconds: number): void {
    this.resendAt.set(Date.now() + seconds * 1000);
    this.clock.set(Date.now());
    clearInterval(this.ticker);
    if (seconds <= 0) return;
    this.ticker = setInterval(() => {
      this.clock.set(Date.now());
      if (this.resendIn() === 0) clearInterval(this.ticker);
    }, 1000);
  }

  /**
   * Notices a link clicked on another device or in the mail app's browser. It keeps going while
   * the page is hidden (browsers slow such timers down on their own): an app in the background
   * does not always report coming back.
   */
  private startPolling(): void {
    clearInterval(this.poller);
    this.poller = setInterval(() => this.checkVerified(), POLL_MS);
  }

  private checkVerified(): void {
    if (this.checking || !this.signedIn() || (this.stage() !== 'code' && this.stage() !== 'change')) return;
    this.checking = true;
    this.auth.refreshProfile().subscribe({
      next: (user) => {
        this.checking = false;
        if (!user.mustVerifyEmail) this.verified();
      },
      error: () => {
        this.checking = false;
      },
    });
  }
}
