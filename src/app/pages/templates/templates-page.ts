import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Template } from '../../core/models/app.models';
import { AuthService } from '../../core/services/auth.service';
import { ResumeService } from '../../core/services/resume.service';
import { ToastService } from '../../core/services/ui.service';
import { errorMessage } from '../../core/utils/http';
import { PublicHeader } from '../../layout/public-header/public-header';
import { TemplateGallery } from './template-gallery';

@Component({
  selector: 'app-templates-page',
  imports: [TemplateGallery, PublicHeader],
  template: `
    @if (isPublic()) {
      <app-public-header />
      <div class="public-bg" aria-hidden="true">
        <div class="aurora"><i></i><i></i><i></i></div>
        <div class="grid-bg"></div>
      </div>
    }
    <div class="page" [class.public]="isPublic()">
      <div class="page-header">
        <div>
          <span class="eyebrow"><span class="i sm">auto_awesome</span> 16 layouts · 24 palettes · 12 font pairs</span>
          <h1>Resume templates</h1>
          <p>4,600+ recruiter-approved designs. Every template is fully customizable — colors, fonts, spacing and sections.</p>
        </div>
        @if (creating()) {
          <span class="creating"><span class="spinner"></span> Creating your resume…</span>
        }
      </div>
      <app-template-gallery (selected)="use($event)" />
    </div>
  `,
  styles: `
    :host { position: relative; display: block; }
    .public-bg { position: absolute; inset: 0 0 auto; height: 620px; z-index: 0; overflow: hidden; pointer-events: none; }
    .public-bg .grid-bg { -webkit-mask-image: radial-gradient(ellipse 70% 80% at 50% 0%, #000 20%, transparent 75%); mask-image: radial-gradient(ellipse 70% 80% at 50% 0%, #000 20%, transparent 75%); }
    .page { position: relative; z-index: 1; }
    .page.public { padding-top: 24px; }
    .page-header h1 { margin-top: 10px; font-size: clamp(30px, 3.4vw, 44px); }
    .creating {
      display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 999px;
      background: var(--primary-50); border: 1px solid var(--primary-100); color: var(--primary-700); font-weight: 600; font-size: 13px;
      animation: rise-in 0.4s var(--ease-out) both;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplatesPage {
  private readonly auth = inject(AuthService);
  private readonly resumes = inject(ResumeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Route data flag for the public (logged-out) version of the page. */
  readonly isPublic = input(false, { alias: 'public' });
  protected readonly creating = signal(false);

  protected use(template: Template): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/register'], { queryParams: { template: template.id } });
      return;
    }
    if (this.creating()) return;
    this.creating.set(true);
    this.resumes.create({ templateId: template.id }).subscribe({
      next: (resume) => void this.router.navigate(['/builder', resume.id]),
      error: (e: unknown) => {
        this.creating.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }
}
