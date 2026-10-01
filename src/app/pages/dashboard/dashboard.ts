import { DatePipe, UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { AtsReport, DocumentFile } from '../../core/models/app.models';
import type { Resume } from '../../core/models/resume.models';
import { AiService } from '../../core/services/ai.service';
import { AtsService } from '../../core/services/ats.service';
import { AuthService } from '../../core/services/auth.service';
import { BillingService, USAGE_LABELS } from '../../core/services/billing.service';
import { DocumentService } from '../../core/services/document.service';
import { ResumeService } from '../../core/services/resume.service';
import { DialogService, ToastService } from '../../core/services/ui.service';
import { pickFile, timeAgo } from '../../core/utils/files';
import { errorMessage } from '../../core/utils/http';
import { CountUp } from '../../shared/motion/count-up';
import { PointerFx } from '../../shared/motion/pointer-fx';
import { Reveal } from '../../shared/motion/reveal';
import { Tilt } from '../../shared/motion/tilt';
import { ScaledResume } from '../../shared/resume/scaled-resume';
import { ClickOutside } from '../../shared/ui/click-outside';
import { scoreColor } from '../../shared/ui/score-ring';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, FormsModule, ScaledResume, DatePipe, UpperCasePipe, ClickOutside, CountUp, PointerFx, Reveal, Tilt],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly ai = inject(AiService);
  protected readonly billing = inject(BillingService);
  private readonly resumeService = inject(ResumeService);
  private readonly atsService = inject(AtsService);
  private readonly documentService = inject(DocumentService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly resumes = signal<Resume[]>([]);
  protected readonly reports = signal<AtsReport[]>([]);
  protected readonly documents = signal<DocumentFile[]>([]);
  protected readonly documentCount = signal(0);
  protected readonly today = new Date();
  protected readonly loading = signal(true);
  protected readonly busy = signal<string | null>(null);
  protected readonly menuFor = signal<string | null>(null);

  protected readonly aiModal = signal(false);
  protected readonly aiPrompt = signal('');
  protected readonly aiRole = signal('');
  protected readonly aiLevel = signal('mid');

  protected readonly timeAgo = timeAgo;
  protected readonly scoreColor = scoreColor;

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  });

  /** Highest ATS score across the user's resumes (0 when none has been scanned). */
  protected readonly bestScore = computed(() =>
    this.resumes().reduce((best, r) => (r.atsScore !== null && r.atsScore > best ? r.atsScore : best), 0),
  );

  /** Today's free-plan usage; null for lifetime members. */
  protected readonly usage = computed(() => {
    const summary = this.billing.summary();
    if (!summary || summary.plan === 'lifetime') return null;
    const meters = (['resume', 'cover_letter', 'document'] as const).map((kind) => {
      const used = summary.used[kind];
      const limit = summary.limits[kind];
      const unlimited = limit < 0;
      return {
        kind,
        label: USAGE_LABELS[kind],
        used,
        limitLabel: unlimited ? '∞' : String(limit),
        full: !unlimited && used >= limit,
        percent: unlimited ? 0 : limit === 0 ? 100 : Math.min(100, (used / limit) * 100),
      };
    });
    return { resetsAt: summary.resetsAt, meters };
  });

  ngOnInit(): void {
    this.billing.refresh(true);
    forkJoin({
      resumes: this.resumeService.list().pipe(catchError(() => of([] as Resume[]))),
      reports: this.atsService.reports().pipe(catchError(() => of([] as AtsReport[]))),
      documents: this.documentService.list().pipe(catchError(() => of([] as DocumentFile[]))),
    }).subscribe(({ resumes, reports, documents }) => {
      this.resumes.set(resumes);
      this.reports.set(reports.slice(0, 5));
      this.documents.set(documents.slice(0, 4));
      this.documentCount.set(documents.length);
      this.loading.set(false);
    });
  }

  protected createBlank(): void {
    this.run('blank', this.resumeService.create({}), (resume) => this.open(resume.id));
  }

  protected createSample(): void {
    this.run('sample', this.resumeService.create({ useSample: true, title: 'Example Resume' }), (resume) =>
      this.open(resume.id),
    );
  }

  protected generateWithAi(): void {
    const prompt = this.aiPrompt().trim();
    if (prompt.length < 10) {
      this.toast.warning('Tell the AI a bit more about your experience (at least a sentence).');
      return;
    }
    this.busy.set('ai');
    this.ai.generateResume(prompt, this.aiRole(), this.aiLevel()).subscribe({
      next: ({ content }) => {
        const personal = content.personal;
        if (!personal.fullName) personal.fullName = this.auth.user()?.fullName ?? '';
        if (!personal.email) personal.email = this.auth.user()?.email ?? '';
        this.resumeService.create({ content, title: `${personal.jobTitle || 'AI'} Resume` }).subscribe({
          next: (resume) => {
            this.aiModal.set(false);
            this.toast.success('Your AI resume draft is ready — review and personalise it.');
            this.open(resume.id);
          },
          error: (e: unknown) => this.fail(e),
        });
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected async importResume(): Promise<void> {
    const [file] = await pickFile('.pdf,.docx,.doc,.txt,.rtf,.png,.jpg,.jpeg,.webp');
    if (!file) return;
    this.busy.set('import');
    this.ai.parseResume(file).subscribe({
      next: ({ content, warnings }) => {
        this.resumeService
          .create({ content, title: `${file.name.replace(/\.[^.]+$/, '')} (imported)` })
          .subscribe({
            next: (resume) => {
              this.toast.success('Resume imported! Pick a template and polish it.');
              warnings.forEach((w) => this.toast.warning(w));
              this.open(resume.id);
            },
            error: (e: unknown) => this.fail(e),
          });
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected open(id: string): void {
    this.busy.set(null);
    this.billing.refresh(true);
    void this.router.navigate(['/builder', id]);
  }

  protected duplicate(resume: Resume): void {
    this.menuFor.set(null);
    this.resumeService.duplicate(resume.id).subscribe({
      next: (copy) => {
        this.resumes.update((list) => [copy, ...list]);
        this.billing.refresh(true);
        this.toast.success('Resume duplicated');
      },
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  protected closeMenu(id: string): void {
    if (this.menuFor() === id) this.menuFor.set(null);
  }

  protected async rename(resume: Resume): Promise<void> {
    this.menuFor.set(null);
    const title = await this.dialogs.prompt({ title: 'Rename resume', label: 'Title', value: resume.title });
    if (!title || title === resume.title) return;
    this.resumeService.update(resume.id, { title }).subscribe({
      next: (updated) => this.resumes.update((list) => list.map((r) => (r.id === updated.id ? updated : r))),
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  protected async remove(resume: Resume): Promise<void> {
    this.menuFor.set(null);
    const confirmed = await this.dialogs.confirm({
      title: 'Delete resume?',
      message: `"${resume.title}" will be permanently deleted.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.resumeService.remove(resume.id).subscribe({
      next: () => {
        this.resumes.update((list) => list.filter((r) => r.id !== resume.id));
        this.toast.success('Resume deleted');
      },
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  protected docIcon(doc: DocumentFile): string {
    return { pdf: 'picture_as_pdf', image: 'image', rich: 'article', canvas: 'draw' }[doc.kind] ?? 'description';
  }

  private run<T>(key: string, request: Observable<T>, done: (value: T) => void): void {
    if (this.busy()) return;
    this.busy.set(key);
    request.subscribe({ next: done, error: (e: unknown) => this.fail(e) });
  }

  private fail(error: unknown): void {
    this.busy.set(null);
    this.toast.error(errorMessage(error));
  }
}
