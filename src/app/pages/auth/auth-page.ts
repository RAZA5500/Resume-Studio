import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SAMPLE_CONTENT } from '../../core/models/resume.models';
import { AuthService } from '../../core/services/auth.service';
import { ResumeService } from '../../core/services/resume.service';
import { errorMessage } from '../../core/utils/http';
import { DEFAULT_DESIGN } from '../../shared/resume/resume-renderer';
import { ScaledResume } from '../../shared/resume/scaled-resume';
import { PointerFx } from '../../shared/motion/pointer-fx';
import { Logo } from '../../shared/ui/logo';
import { ScoreRing } from '../../shared/ui/score-ring';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

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

  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected readonly isRegister = computed(() => this.mode() === 'register');
  protected readonly sample = SAMPLE_CONTENT;
  protected readonly sampleDesign = { ...DEFAULT_DESIGN, layout: 'modern', primaryColor: '#4c1d95', accentColor: '#8b5cf6', headingStyle: 'line' as const, uppercaseHeadings: true, skillStyle: 'inline' as const };
  protected readonly features = [
    '4,608 ATS-friendly templates',
    'AI help with summaries, bullets and cover letters',
    'ATS score with keyword matching',
    'Edit PDFs, images and Word files',
  ];

  protected readonly strength = computed(() => {
    const value = this.password();
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return Math.min(4, score);
  });
  protected readonly strengthLabel = computed(() => ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][this.strength()]);

  protected submit(): void {
    if (this.loading()) return;
    this.error.set('');
    if (this.isRegister() && this.fullName().trim().length < 2) return this.error.set('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) return this.error.set('Please enter a valid email address.');
    if (this.password().length < (this.isRegister() ? 8 : 1)) {
      return this.error.set(this.isRegister() ? 'Password must be at least 8 characters.' : 'Please enter your password.');
    }

    this.loading.set(true);
    const request = this.isRegister()
      ? this.auth.register(this.fullName().trim(), this.email().trim(), this.password())
      : this.auth.login(this.email().trim(), this.password());

    request.subscribe({
      next: () => this.afterAuth(),
      error: (e: unknown) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
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
