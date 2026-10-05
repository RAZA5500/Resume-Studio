import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { OAuthProvider } from '../../core/models/app.models';
import { SAMPLE_CONTENT } from '../../core/models/resume.models';
import { apiOrigin, serverIsConfigurable } from '../../core/services/api-url.interceptor';
import { AuthService } from '../../core/services/auth.service';
import { ResumeService } from '../../core/services/resume.service';
import { errorMessage } from '../../core/utils/http';
import { DEFAULT_DESIGN } from '../../shared/resume/resume-renderer';
import { ScaledResume } from '../../shared/resume/scaled-resume';
import { PointerFx } from '../../shared/motion/pointer-fx';
import { Logo } from '../../shared/ui/logo';
import { ScoreRing } from '../../shared/ui/score-ring';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

/** Words that common passwords are built from (letters only; the API has the full list). */
const COMMON_WORDS = new Set([
  'password', 'passw', 'pass', 'pakistan', 'pakistani', 'bismillah', 'qwerty', 'qwertyuiop', 'asdf', 'asdfgh',
  'zxcvbnm', 'abc', 'abcd', 'abcdef', 'abcdefgh', 'admin', 'welcome', 'iloveyou', 'letmein', 'muhammad', 'mohammad',
  'allah', 'allahuakbar', 'mashallah', 'cricket', 'resume', 'resumestudio', 'test', 'login', 'monkey', 'dragon',
  'football', 'sunshine', 'princess', 'lahore', 'karachi', 'islamabad', 'love', 'secret', 'master', 'shadow',
]);

/** Seconds to wait after an HTTP 429 (from the body of a lockout, or the rate limiter's header). */
function retryAfterSeconds(error: unknown): number {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429) return 0;
  const fromBody = Number((error.error as { retryAfter?: unknown } | null)?.retryAfter);
  const seconds = Number.isFinite(fromBody) && fromBody > 0 ? fromBody : Number(error.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 24 * 3600) : 60;
}

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, Logo, ScaledResume, ScoreRing, ThemeToggle, PointerFx],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly resumes = inject(ResumeService);
  private readonly router = inject(Router);

  /** Bound from route data. */
  readonly mode = input<'login' | 'register'>('login');
  /** Bound from query params. */
  readonly returnUrl = input<string>();
  readonly template = input<string>();
  readonly expired = input<string>();

  /** Android test builds: the backend chosen on the Connect page, with a link to change it. */
  protected readonly server = serverIsConfigurable() ? apiOrigin() : '';
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  /** Honeypot (see the hidden field in the template). */
  protected readonly website = signal('');
  /** "Continue with Google / Apple" buttons the server supports. */
  protected readonly oauthProviders = this.auth.oauthProviders;
  /** The provider being opened (its button shows a spinner). */
  protected readonly oauthBusy = signal<OAuthProvider | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  /** After too many failed attempts the API says how long to wait; the button counts down. */
  private readonly retryAt = signal(0);
  private readonly clock = signal(Date.now());
  private ticker?: ReturnType<typeof setInterval>;
  protected readonly waitSeconds = computed(() => Math.max(0, Math.ceil((this.retryAt() - this.clock()) / 1000)));
  protected readonly waitLabel = computed(() => {
    const seconds = this.waitSeconds();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  protected readonly isRegister = computed(() => this.mode() === 'register');
  protected readonly sample = SAMPLE_CONTENT;
  protected readonly sampleDesign = { ...DEFAULT_DESIGN, layout: 'modern', primaryColor: '#1e3a8a', accentColor: '#2563eb', headingStyle: 'line' as const, uppercaseHeadings: true, skillStyle: 'inline' as const };
  protected readonly features = [
    '4,608 ATS-friendly templates',
    'AI help with summaries, bullets and cover letters',
    'ATS score with keyword matching',
    'Edit PDFs, images and Word files',
  ];

  /**
   * A well-known word with digits and symbols around it ("Pakistan@123"), a repeated
   * pattern, or the person's own name or email: the API refuses these, so the meter never calls
   * them strong. (The API's full check also covers breached passwords.)
   */
  protected readonly tooCommon = computed(() => {
    const value = this.password().toLowerCase();
    if (!value) return false;
    const letters = value.replace(/[^\p{L}]/gu, '');
    const name = this.fullName().toLowerCase().split(/\s+/).filter((part) => part.length >= 3);
    const local = this.email().toLowerCase().split('@')[0].replace(/[^\p{L}]/gu, '');
    return (
      /^(.{1,4})\1+$/u.test(value) ||
      COMMON_WORDS.has(letters) ||
      name.includes(letters) ||
      letters === name.join('') ||
      (local.length >= 4 && letters === local)
    );
  });
  protected readonly strength = computed(() => {
    const value = this.password();
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    // Without any letters ("12345678!") a password stays weak whatever else it has.
    return this.tooCommon() || !/\p{L}/u.test(value) ? Math.min(1, score) : Math.min(4, score);
  });
  protected readonly strengthLabel = computed(() =>
    this.tooCommon() && this.password().length >= 8 ? 'Too common' : ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][this.strength()],
  );

  constructor() {
    // The anti-bot check is solved while the visitor fills in the form.
    this.auth.prepareProof();
    this.auth.loadOAuthProviders();
    inject(DestroyRef).onDestroy(() => clearInterval(this.ticker));
  }

  protected async social(provider: OAuthProvider): Promise<void> {
    if (this.oauthBusy()) return;
    this.error.set('');
    this.oauthBusy.set(provider);
    try {
      await this.auth.startOAuth(provider, { returnUrl: this.returnUrl(), template: this.template() });
    } catch {
      this.error.set('Could not open the sign-in page. Please try again.');
    }
    // The website is leaving now; the Android app stays here while the phone's browser signs in.
    setTimeout(() => this.oauthBusy.set(null), 4000);
  }

  protected submit(): void {
    if (this.loading() || this.waitSeconds() > 0) return;
    this.error.set('');
    if (this.isRegister() && this.fullName().trim().length < 2) return this.error.set('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) return this.error.set('Please enter a valid email address.');
    if (this.password().length < (this.isRegister() ? 8 : 1)) {
      return this.error.set(this.isRegister() ? 'Password must be at least 8 characters.' : 'Please enter your password.');
    }

    this.loading.set(true);
    const request = this.isRegister()
      ? this.auth.register(this.fullName().trim(), this.email().trim(), this.password(), this.website())
      : this.auth.login(this.email().trim(), this.password(), this.website());

    request.subscribe({
      next: () => this.afterAuth(),
      error: (e: unknown) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
        const wait = retryAfterSeconds(e);
        if (wait) this.startWait(wait);
      },
    });
  }

  private startWait(seconds: number): void {
    this.retryAt.set(Date.now() + seconds * 1000);
    this.clock.set(Date.now());
    clearInterval(this.ticker);
    this.ticker = setInterval(() => {
      this.clock.set(Date.now());
      if (this.waitSeconds() > 0) return;
      clearInterval(this.ticker);
      this.error.set('');
    }, 1000);
  }

  private afterAuth(): void {
    const templateId = this.template();
    if (templateId) {
      this.resumes.create({ templateId }).subscribe({
        next: (resume) => void this.router.navigate(['/builder', resume.id]),
        error: () => void this.router.navigateByUrl('/app/dashboard'),
      });
      return;
    }
    const target = this.returnUrl();
    void this.router.navigateByUrl(target && target.startsWith('/') ? target : '/app/dashboard');
  }
}
