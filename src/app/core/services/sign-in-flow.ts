import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { type AfterSignIn, AuthService } from './auth.service';
import { ResumeService } from './resume.service';

/** Only paths inside the app (no "//other-site.com"); the verification page itself is no destination. */
export function safeAppPath(value: string | null | undefined, fallback = '/app/dashboard'): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/verify-email') ? value : fallback;
}

/**
 * Where the app goes once someone has signed in — from the log-in page, Google / Apple, or after
 * confirming the email: the email address first (while it still needs confirming), then the
 * template they picked, the optional two-factor offer, or the page they were headed to.
 */
@Injectable({ providedIn: 'root' })
export class SignInFlow {
  private readonly auth = inject(AuthService);
  private readonly resumes = inject(ResumeService);
  private readonly router = inject(Router);

  continue(after: AfterSignIn, options: { offerTwoFactor: boolean; replaceUrl?: boolean }): void {
    const replaceUrl = options.replaceUrl ?? false;
    if (this.auth.mustVerifyEmail()) {
      void this.router.navigate(['/verify-email'], {
        queryParams: { returnUrl: after.returnUrl, template: after.template, offer: options.offerTwoFactor ? 1 : undefined },
        replaceUrl,
      });
      return;
    }
    if (after.template) {
      this.resumes.create({ templateId: after.template }).subscribe({
        next: (resume) => void this.router.navigate(['/builder', resume.id], { replaceUrl }),
        error: () => void this.router.navigateByUrl('/app/dashboard', { replaceUrl }),
      });
      return;
    }
    const target = safeAppPath(after.returnUrl);
    // Signed in without two-factor: offer it once (optional, can be skipped). With it on, straight in.
    if (options.offerTwoFactor && this.auth.shouldOfferTwoFactor()) {
      void this.router.navigate(['/two-factor'], { queryParams: { next: target }, replaceUrl });
      return;
    }
    void this.router.navigateByUrl(target, { replaceUrl });
  }
}
