import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { TwoFactorSetup } from '../../core/models/app.models';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/ui.service';
import { downloadBlob } from '../../core/utils/files';
import { errorMessage } from '../../core/utils/http';
import { Logo } from '../../shared/ui/logo';

type Stage = 'offer' | 'scan' | 'confirm' | 'codes';

/**
 * Two-factor setup. Opened after signing in (an optional offer — "Skip for now" goes straight on)
 * and from Profile (?setup=1). Accounts that already have it on go straight to `next`.
 */
@Component({
  selector: 'app-two-factor-page',
  imports: [FormsModule, Logo],
  template: `
    <div class="wrap">
      <app-logo [link]="next" />
      <div class="card box">
        @switch (stage()) {
          @case ('offer') {
            <span class="ic" aria-hidden="true"><span class="i">verified_user</span></span>
            <h1>Protect your account</h1>
            <p class="muted">
              Turn on two-factor authentication: when you sign in, you also enter a 6-digit code from an app on your phone
              (Google Authenticator, Microsoft Authenticator, Authy…). Even someone who learns your password cannot get in.
            </p>
            <ul class="points">
              <li><span class="i sm">check</span> Takes about two minutes</li>
              <li><span class="i sm">check</span> Works offline — no SMS needed</li>
              <li><span class="i sm">check</span> Backup codes in case you lose your phone</li>
            </ul>
            @if (error()) {
              <div class="alert danger"><span class="i">error</span><span>{{ error() }}</span></div>
            }
            <button class="btn btn-primary btn-lg btn-block" type="button" (click)="start()" [disabled]="busy()">
              @if (busy()) {
                <span class="spinner"></span>
              }
              Set up two-factor
            </button>
            <button class="btn btn-ghost btn-block" type="button" (click)="skip()">Skip for now</button>
            <label class="check">
              <input type="checkbox" [ngModel]="dontAsk()" (ngModelChange)="dontAsk.set($event)" />
              <span>Don't ask me again on this device</span>
            </label>
          }

          @case ('scan') {
            <ol class="steps"><li class="on">Scan</li><li>Verify</li><li>Backup codes</li></ol>
            <h1>Scan this QR code</h1>
            <p class="muted">In your authenticator app tap <b>+</b> (add account), then scan the code.</p>
            @if (setup(); as s) {
              <img class="qr" [src]="qrUrl()" width="200" height="200" alt="QR code for your authenticator app" />
              <div class="manual">
                <span class="small subtle">Can't scan? Type this key into the app:</span>
                <div class="secret">
                  <code>{{ groupedSecret() }}</code>
                  <button class="btn btn-ghost btn-xs btn-icon" type="button" (click)="copy(s.secret, 'Key copied')" aria-label="Copy key">
                    <span class="i">content_copy</span>
                  </button>
                </div>
              </div>
            }
            <button class="btn btn-primary btn-lg btn-block" type="button" (click)="stage.set('confirm')">I've added it</button>
            <button class="btn btn-ghost btn-block" type="button" (click)="skip()">Cancel</button>
          }

          @case ('confirm') {
            <ol class="steps"><li class="done">Scan</li><li class="on">Verify</li><li>Backup codes</li></ol>
            <h1>Enter the code</h1>
            <p class="muted">Type the 6-digit code your app now shows for ResumeStudio.</p>
            <form class="stack full" (ngSubmit)="confirm()" novalidate>
              <input #codeInput class="input code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"
                (input)="onCode(codeInput)" />
              @if (error()) {
                <div class="alert danger"><span class="i">error</span><span>{{ error() }}</span></div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
                @if (busy()) {
                  <span class="spinner"></span>
                }
                Turn on two-factor
              </button>
            </form>
            <button class="btn btn-ghost btn-block" type="button" (click)="stage.set('scan')">Back to the QR code</button>
          }

          @case ('codes') {
            <ol class="steps"><li class="done">Scan</li><li class="done">Verify</li><li class="on">Backup codes</li></ol>
            <span class="ic ok" aria-hidden="true"><span class="i">check_circle</span></span>
            <h1>Two-factor is on</h1>
            <p class="muted">
              Save these backup codes somewhere safe. If you lose your phone, each code lets you sign in once.
            </p>
            <div class="codes">
              @for (c of backupCodes(); track c) {
                <code>{{ c }}</code>
              }
            </div>
            <div class="row row-wrap center">
              <button class="btn btn-sm" type="button" (click)="copy(backupCodes().join('\\n'), 'Backup codes copied')"><span class="i">content_copy</span> Copy</button>
              <button class="btn btn-sm" type="button" (click)="download()"><span class="i">download</span> Download</button>
            </div>
            <label class="check">
              <input type="checkbox" [ngModel]="saved()" (ngModelChange)="saved.set($event)" />
              <span>I have saved my backup codes</span>
            </label>
            <button class="btn btn-primary btn-lg btn-block" type="button" (click)="done()" [disabled]="!saved()">Continue</button>
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
    .ic .i { font-size: 30px; }
    .points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; align-self: stretch; text-align: left; font-size: 13.5px; color: var(--text-2); }
    .points li { display: flex; align-items: center; gap: 8px; }
    .points .i { color: var(--success); }
    .check { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text-2); cursor: pointer; }
    .check input { width: 16px; height: 16px; accent-color: var(--primary); }
    .steps { list-style: none; margin: 0 0 4px; padding: 0; display: flex; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-3); }
    .steps li { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); }
    .steps li.on { color: #fff; background: var(--grad-brand); border-color: transparent; }
    .steps li.done { color: var(--success); border-color: var(--success-line); background: var(--success-50); }
    .qr { width: 200px; height: 200px; border-radius: 14px; background: #fff; padding: 6px; box-shadow: var(--shadow-sm); }
    .manual { display: flex; flex-direction: column; gap: 6px; align-self: stretch; }
    .secret { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; border: 1px dashed var(--border-strong); border-radius: 12px; }
    .secret code { font-family: var(--font-mono); font-size: 13.5px; letter-spacing: 0.06em; word-break: break-all; }
    .full { align-self: stretch; }
    .code { height: 52px; font-family: var(--font-mono); font-size: 22px; letter-spacing: 0.35em; text-align: center; }
    .codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-self: stretch; }
    .codes code { padding: 8px 6px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); font-family: var(--font-mono); font-size: 14px; letter-spacing: 0.05em; }
    .center { justify-content: center; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Where to go afterwards (only app paths). */
  protected readonly next = (() => {
    const value = inject(ActivatedRoute).snapshot.queryParamMap.get('next') ?? '';
    return value.startsWith('/') && !value.startsWith('//') ? value : '/app/dashboard';
  })();

  protected readonly stage = signal<Stage>('offer');
  protected readonly setup = signal<TwoFactorSetup | null>(null);
  protected readonly code = signal('');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  protected readonly backupCodes = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly dontAsk = signal(false);
  protected readonly saved = signal(false);

  /** The server's SVG QR code as an image (no HTML injection). */
  protected readonly qrUrl = computed(() => {
    const svg = this.setup()?.qrSvg;
    return svg ? `data:image/svg+xml;base64,${btoa(svg)}` : '';
  });
  protected readonly groupedSecret = computed(() => (this.setup()?.secret ?? '').replace(/(.{4})/g, '$1 ').trim());

  ngOnInit(): void {
    const setupNow = this.route.snapshot.queryParamMap.get('setup') === '1';
    // Already protected: nothing to offer — straight on.
    if (this.auth.user()?.twoFactorEnabled) {
      void this.router.navigateByUrl(this.next, { replaceUrl: true });
      return;
    }
    if (setupNow) this.start();
  }

  protected start(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.auth.twoFactorSetup().subscribe({
      next: (setup) => {
        this.busy.set(false);
        this.setup.set(setup);
        this.stage.set('scan');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
        this.stage.set('offer');
      },
    });
  }

  protected onCode(input: HTMLInputElement): void {
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value !== digits) input.value = digits;
    this.code.set(digits);
    if (digits.length === 6) this.confirm();
  }

  protected confirm(): void {
    if (this.busy()) return;
    if (!/^\d{6}$/.test(this.code())) {
      this.error.set('Enter the 6-digit code from your app.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.twoFactorEnable(this.code()).subscribe({
      next: ({ backupCodes }) => {
        this.busy.set(false);
        this.backupCodes.set(backupCodes);
        this.stage.set('codes');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        // Emptied directly (see VerifyEmailPage.clearCode): the binding-free field keeps no stale digits.
        this.code.set('');
        const input = this.codeInput()?.nativeElement;
        if (input) {
          input.value = '';
          input.focus();
        }
        this.error.set(errorMessage(e));
      },
    });
  }

  protected skip(): void {
    if (this.dontAsk()) this.auth.dismissTwoFactorOffer();
    void this.router.navigateByUrl(this.next, { replaceUrl: true });
  }

  protected done(): void {
    this.toast.success('Two-factor sign-in is on.');
    void this.router.navigateByUrl(this.next, { replaceUrl: true });
  }

  protected async copy(text: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(message);
    } catch {
      this.toast.info(text);
    }
  }

  protected download(): void {
    const email = this.auth.user()?.email ?? '';
    const text = `ResumeStudio backup codes${email ? ` for ${email}` : ''}\nEach code works once.\n\n${this.backupCodes().join('\n')}\n`;
    downloadBlob(new Blob([text], { type: 'text/plain' }), 'ResumeStudio-backup-codes.txt');
  }
}
