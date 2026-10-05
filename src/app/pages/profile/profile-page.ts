import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/services/ai.service';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { DialogService, ToastService } from '../../core/services/ui.service';
import { errorMessage } from '../../core/utils/http';

@Component({
  selector: 'app-profile-page',
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="page narrow">
      <div class="page-header">
        <div>
          <span class="eyebrow"><span class="i sm">manage_accounts</span> Your account</span>
          <h1>Profile & settings</h1>
          <p>Manage your account details and security.</p>
        </div>
      </div>

      <section class="card">
        <div class="card-header"><h3><span class="i">person</span> Your profile</h3></div>
        <div class="card-pad stack">
          <div class="who">
            <span class="avatar">{{ auth.initials() }}</span>
            <div>
              <strong>{{ auth.user()?.fullName }}</strong>
              <small>{{ auth.user()?.email }} · member since {{ auth.user()?.createdAt | date: 'mediumDate' }}</small>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Full name</label>
              <input class="input" [ngModel]="fullName()" (ngModelChange)="fullName.set($event)" />
            </div>
            <div class="field">
              <label>Headline</label>
              <input class="input" [ngModel]="headline()" (ngModelChange)="headline.set($event)" placeholder="e.g. Frontend Engineer" />
            </div>
          </div>
          <div><button class="btn btn-primary" type="button" (click)="saveProfile()" [disabled]="saving()">Save profile</button></div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h3><span class="i">workspace_premium</span> Plan</h3>
          <a class="btn btn-sm" [routerLink]="billing.isLifetime() ? '/app/billing' : '/checkout'">{{ billing.isLifetime() ? 'View billing' : 'Upgrade' }}</a>
        </div>
        <div class="card-pad">
          @if (billing.isLifetime()) {
            <p>
              <span class="badge success">Lifetime</span> Unlimited resumes, cover letters and document edits.
              @if (auth.user()?.planActivatedAt; as since) {
                <span class="subtle">Active since {{ since | date: 'mediumDate' }}</span>
              }
            </p>
          } @else {
            <p><span class="badge">Free</span> 1 resume, 1 cover letter and 1 document edit per day. Lifetime access is PKR {{ billing.price() }}, one-time.</p>
          }
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h3><span class="i">lock</span> Sign-in &amp; security</h3></div>
        <div class="card-pad stack">
          @if (providerNames(); as names) {
            <p class="methods"><span class="i">verified</span> You sign in with {{ names }}{{ noPassword() ? '' : ' or your email and password' }}.</p>
          }
          @if (noPassword()) {
            <div class="field">
              <label>New password</label>
              <input class="input" type="password" autocomplete="new-password" [ngModel]="next()" (ngModelChange)="next.set($event)" placeholder="At least 8 characters" />
            </div>
            <p class="small subtle">Add a password to also sign in with your email address. Avoid common passwords and your name or email.</p>
          } @else {
            <div class="grid-2">
              <div class="field">
                <label>Current password</label>
                <input class="input" type="password" autocomplete="current-password" [ngModel]="current()" (ngModelChange)="current.set($event)" />
              </div>
              <div class="field">
                <label>New password</label>
                <input class="input" type="password" autocomplete="new-password" [ngModel]="next()" (ngModelChange)="next.set($event)" placeholder="At least 8 characters" />
              </div>
            </div>
            <p class="small subtle">Changing your password signs you out on every other device. Avoid common passwords and your name or email.</p>
          }
          <div class="row row-wrap">
            <button class="btn" type="button" (click)="changePassword()" [disabled]="saving()">{{ noPassword() ? 'Set password' : 'Update password' }}</button>
            <button class="btn btn-ghost" type="button" (click)="logoutEverywhere()" [disabled]="saving()">
              <span class="i">devices</span> Sign out of all devices
            </button>
          </div>
        </div>
      </section>

      @if (auth.user()?.isAdmin) {
        <section class="card">
          <div class="card-header"><h3><span class="i">auto_awesome</span> AI engine (admin only)</h3></div>
          <div class="card-pad stack">
            @if (ai.enabled()) {
              <div class="alert success"><span class="i">check_circle</span><span>AI is active via OpenRouter ({{ ai.status()?.model }}).</span></div>
            } @else {
              <div class="alert warning">
                <span class="i">key</span>
                <div>AI is running in <b>offline mode</b> (rule-based). To enable it, set <code>OPENROUTER_API_KEY</code> on the server (<code>backend/.env</code> locally) and restart the backend.</div>
              </div>
            }
          </div>
        </section>
      }

      <button class="btn btn-danger-soft" type="button" (click)="auth.logout()"><span class="i">logout</span> Log out</button>
    </div>
  `,
  styles: `
    .narrow { max-width: 860px; display: flex; flex-direction: column; gap: 20px; }
    .card-header h3 .i { color: var(--primary-700); }
    .who { display: flex; align-items: center; gap: 16px; padding: 4px 0 8px; }
    .who strong { display: block; font-size: 18px; font-family: var(--font-display); letter-spacing: -0.02em; }
    .who small { color: var(--text-3); }
    .avatar {
      width: 60px; height: 60px; border-radius: 50%; flex-shrink: 0;
      display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 20px;
      background: var(--grad-brand);
      box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px rgba(96, 165, 250, 0.45);
      animation: pop-in 0.6s var(--ease-spring) both;
    }
    .card-pad p { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text-2); }
    code { font-size: 12px; background: var(--surface-3); padding: 1px 5px; border-radius: 5px; }
    .btn-danger-soft { align-self: flex-start; }
    .methods .i { color: var(--success); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly ai = inject(AiService);
  protected readonly billing = inject(BillingService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);

  protected readonly fullName = signal(this.auth.user()?.fullName ?? '');
  protected readonly headline = signal(this.auth.user()?.headline ?? '');
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly saving = signal(false);
  /** Accounts made with Google / Apple have no password until they set one here. */
  protected readonly noPassword = computed(() => this.auth.user()?.hasPassword === false);
  protected readonly providerNames = computed(() =>
    (this.auth.user()?.providers ?? []).map((p) => (p === 'google' ? 'Google' : 'Apple')).join(' and '),
  );

  constructor() {
    // Fresh sign-in methods (they change when an account is linked to Google / Apple).
    this.auth.refreshProfile().subscribe({ error: () => undefined });
  }

  protected saveProfile(): void {
    this.saving.set(true);
    this.auth.updateProfile({ fullName: this.fullName().trim(), headline: this.headline().trim() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Profile updated');
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  protected async logoutEverywhere(): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: 'Sign out of all devices?',
      message: 'Every device signed in to this account is signed out, this one included. Use it if you think someone else knows your password.',
      confirmText: 'Sign out everywhere',
      danger: true,
    });
    if (!ok) return;
    this.saving.set(true);
    this.auth.logoutEverywhere().subscribe({
      next: () => this.toast.success('Signed out of all devices'),
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  protected changePassword(): void {
    if (this.next().length < 8) return this.toast.info('New password must be at least 8 characters.');
    this.saving.set(true);
    const setting = this.noPassword();
    this.auth.changePassword(setting ? undefined : this.current(), this.next()).subscribe({
      next: () => {
        this.saving.set(false);
        this.current.set('');
        this.next.set('');
        this.auth.refreshProfile().subscribe({ error: () => undefined });
        this.toast.success(setting ? 'Password set. You can now also sign in with your email.' : 'Password updated. Other devices were signed out.');
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }
}
