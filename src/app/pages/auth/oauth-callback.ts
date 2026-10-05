import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type AfterSignIn, AuthService } from '../../core/services/auth.service';
import { ResumeService } from '../../core/services/resume.service';
import { ToastService } from '../../core/services/ui.service';
import { errorMessage } from '../../core/utils/http';
import { Logo } from '../../shared/ui/logo';

/** Error codes the API's OAuthService sends back (…/auth/callback?error=…). */
const MESSAGES: Record<string, string> = {
  cancelled: 'You cancelled the sign-in.',
  expired: 'The sign-in took too long or was already used. Please try again.',
  email_unverified: 'The email address of that account is not verified yet. Verify it with Google first, or sign up with email and password.',
  no_email: 'No email address was shared. Please try again and allow ResumeStudio to see your email (Apple can hide it behind a relay address).',
  unavailable: 'This sign-in option is not available right now. Please use email and password.',
  too_many: 'Too many new accounts were created from your network. Please try again later.',
  failed: 'We could not sign you in. Please try again.',
};

/**
 * Where Google / Apple sign-in ends (through the API, which has already verified the account):
 * trades the one-time code for a session, then continues like the log-in page would.
 */
@Component({
  selector: 'app-oauth-callback',
  imports: [RouterLink, Logo],
  template: `
    <div class="wrap">
      <app-logo />
      <div class="card box" aria-live="polite">
        @if (error(); as message) {
          <span class="ic"><span class="i">error</span></span>
          <h1>Sign-in did not finish</h1>
          <p class="muted">{{ message }}</p>
          <a class="btn btn-primary" routerLink="/login">Back to log in</a>
        } @else {
          <span class="spinner lg"></span>
          <h1>Signing you in…</h1>
          <p class="muted">Just a moment.</p>
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 26px;
      padding: 24px 16px;
    }
    .box {
      width: min(420px, 100%);
      padding: 32px 26px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-align: center;
      animation: rise-in 0.45s var(--ease-out) both;
    }
    h1 {
      font-size: 21px;
      letter-spacing: -0.03em;
    }
    .ic {
      width: 52px;
      height: 52px;
      display: grid;
      place-items: center;
      border-radius: 16px;
      color: #fff;
      background: var(--grad-rose);
      .i {
        font-size: 28px;
      }
    }
    .spinner {
      color: var(--primary);
    }
    .btn {
      margin-top: 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuthCallback implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly resumes = inject(ResumeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly toast = inject(ToastService);

  protected readonly error = signal('');

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const failure = params.get('error');
    // The code is single-use anyway; keep it out of the history and the address bar.
    this.location.replaceState('/auth/callback');
    if (failure || !code) {
      this.error.set(MESSAGES[failure ?? 'failed'] ?? MESSAGES['failed']);
      return;
    }
    this.auth.completeOAuth(code).subscribe({
      next: (result) => {
        if (result.notice === 'password_removed') {
          this.toast.info('Signed in. For your security, the password set earlier on this email was turned off — you can set a new one in Profile.');
        }
        this.continue(result.after);
      },
      error: (e: unknown) => this.error.set(e instanceof HttpErrorResponse ? errorMessage(e) : (e as Error).message),
    });
  }

  private continue(after: AfterSignIn): void {
    if (after.template) {
      this.resumes.create({ templateId: after.template }).subscribe({
        next: (resume) => void this.router.navigate(['/builder', resume.id], { replaceUrl: true }),
        error: () => void this.router.navigateByUrl('/app/dashboard', { replaceUrl: true }),
      });
      return;
    }
    const target = after.returnUrl;
    const safe = target && target.startsWith('/') && !target.startsWith('//') ? target : '/app/dashboard';
    void this.router.navigateByUrl(safe, { replaceUrl: true });
  }
}
