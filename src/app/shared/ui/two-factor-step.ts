import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AuthResponse } from '../../core/models/app.models';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/utils/http';

/**
 * Sign-in step two for accounts with two-factor on: the 6-digit code from the authenticator app
 * (sent as soon as all six digits are typed) or a backup code, with "remember this device".
 */
@Component({
  selector: 'app-two-factor-step',
  imports: [FormsModule],
  template: `
    <div class="tfa">
      <span class="tfa-ic" aria-hidden="true"><span class="i">phonelink_lock</span></span>
      <h1>Two-factor verification</h1>
      <p class="muted">
        @if (useBackup()) {
          Enter one of your backup codes. Each code works only once.
        } @else {
          Open your authenticator app and enter the 6-digit code for ResumeStudio.
        }
      </p>

      @if (expired()) {
        <div class="alert warning"><span class="i">schedule</span><span>{{ error() }}</span></div>
        <button class="btn btn-primary btn-lg btn-block" type="button" (click)="cancel.emit()">Sign in again</button>
      } @else {
        <form class="stack" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="tfa-code">{{ useBackup() ? 'Backup code' : 'Authentication code' }}</label>
            <input
              #codeInput
              id="tfa-code"
              class="input code"
              name="code"
              autocomplete="one-time-code"
              [attr.inputmode]="useBackup() ? 'text' : 'numeric'"
              [attr.maxlength]="useBackup() ? 11 : 6"
              [placeholder]="useBackup() ? 'xxxx-xxxx' : '123456'"
              [ngModel]="code()"
              (ngModelChange)="onInput($event)" />
          </div>
          <label class="remember">
            <input type="checkbox" name="remember" [ngModel]="remember()" (ngModelChange)="remember.set($event)" />
            <span>Remember this device for 30 days</span>
          </label>
          @if (error()) {
            <div class="alert danger"><span class="i">error</span><span>{{ error() }}</span></div>
          }
          <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
            @if (busy()) {
              <span class="spinner"></span>
            }
            Verify
          </button>
        </form>
        <div class="links">
          <button type="button" class="link" (click)="toggleBackup()">{{ useBackup() ? 'Use the code from my app' : 'Use a backup code' }}</button>
          <button type="button" class="link" (click)="cancel.emit()">Back to log in</button>
        </div>
      }
    </div>
  `,
  styles: `
    .tfa { display: flex; flex-direction: column; gap: 14px; }
    .tfa-ic {
      width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px;
      color: #fff; background: var(--grad-brand); box-shadow: 0 14px 30px -14px rgba(37, 99, 235, 0.9);
      animation: pop-in 0.45s var(--ease-spring) both;
    }
    .tfa-ic .i { font-size: 28px; }
    h1 { font-size: clamp(24px, 2.4vw, 28px); letter-spacing: -0.035em; }
    .code { height: 52px; font-family: var(--font-mono); font-size: 22px; letter-spacing: 0.35em; text-align: center; }
    .remember { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text-2); cursor: pointer; }
    .remember input { width: 16px; height: 16px; accent-color: var(--primary); }
    .links { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .link { border: 0; background: none; padding: 4px 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--primary-700); cursor: pointer; }
    .link:hover { text-decoration: underline; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorStep {
  private readonly auth = inject(AuthService);

  readonly challenge = input.required<string>();
  readonly done = output<AuthResponse>();
  readonly cancel = output<void>();

  protected readonly code = signal('');
  protected readonly useBackup = signal(false);
  protected readonly remember = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly expired = signal(false);
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  constructor() {
    afterNextRender(() => this.codeInput()?.nativeElement.focus());
  }

  protected onInput(value: string): void {
    if (this.useBackup()) {
      this.code.set(value);
      return;
    }
    const digits = value.replace(/\D/g, '').slice(0, 6);
    this.code.set(digits);
    if (digits.length === 6) this.submit();
  }

  protected toggleBackup(): void {
    this.useBackup.update((v) => !v);
    this.code.set('');
    this.error.set('');
    setTimeout(() => this.codeInput()?.nativeElement.focus());
  }

  protected submit(): void {
    if (this.busy()) return;
    const code = this.code().trim();
    const valid = this.useBackup() ? /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(code) : /^\d{6}$/.test(code);
    if (!valid) {
      this.error.set(this.useBackup() ? 'Enter a backup code like abcd-efgh.' : 'Enter the 6-digit code from your app.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.verifyTwoFactor(this.challenge(), code, this.remember()).subscribe({
      next: (session) => this.done.emit(session),
      error: (e: unknown) => {
        this.busy.set(false);
        this.code.set('');
        const reason = e instanceof HttpErrorResponse ? (e.error as { code?: string } | null)?.code : undefined;
        if (reason === 'TWO_FACTOR_EXPIRED') this.expired.set(true);
        this.error.set(errorMessage(e));
      },
    });
  }
}
