import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/services/ai.service';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { ToastService } from '../../core/services/ui.service';
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
          <a class="btn btn-sm" routerLink="/app/billing">{{ billing.isLifetime() ? 'View billing' : 'Upgrade' }}</a>
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
        <div class="card-header"><h3><span class="i">lock</span> Change password</h3></div>
        <div class="card-pad stack">
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
          <div><button class="btn" type="button" (click)="changePassword()" [disabled]="saving()">Update password</button></div>
        </div>
      </section>

      @if (auth.user()?.isAdmin) {
        <section class="card">
          <div class="card-header"><h3><span class="i">auto_awesome</span> AI engine (admin only)</h3></div>
          <div class="card-pad stack">
            @if (ai.enabled()) {
              <div class="alert success"><span class="i">check_circle</span><span>Claude AI is active ({{ ai.status()?.model }}).</span></div>
            } @else {
              <div class="alert warning">
                <span class="i">key</span>
                <div>AI is running in <b>offline mode</b> (rule-based). To enable Claude, add <code>ANTHROPIC_API_KEY=your-key</code> to <code>backend/.env</code> and restart the backend.</div>
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
      background: var(--grad-brand); background-size: 200% 200%;
      box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px rgba(96, 165, 250, 0.6), 0 16px 34px -12px rgba(37, 99, 235, 0.9);
      animation: gradient-pan 6s ease-in-out infinite, pop-in 0.6s var(--ease-spring) both;
    }
    .card-pad p { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text-2); }
    code { font-size: 12px; background: var(--surface-3); padding: 1px 5px; border-radius: 5px; }
    .btn-danger-soft { align-self: flex-start; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly ai = inject(AiService);
  protected readonly billing = inject(BillingService);
  private readonly toast = inject(ToastService);

  protected readonly fullName = signal(this.auth.user()?.fullName ?? '');
  protected readonly headline = signal(this.auth.user()?.headline ?? '');
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly saving = signal(false);

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

  protected changePassword(): void {
    if (this.next().length < 8) return this.toast.info('New password must be at least 8 characters.');
    this.saving.set(true);
    this.auth.changePassword(this.current(), this.next()).subscribe({
      next: () => {
        this.saving.set(false);
        this.current.set('');
        this.next.set('');
        this.toast.success('Password updated');
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }
}
