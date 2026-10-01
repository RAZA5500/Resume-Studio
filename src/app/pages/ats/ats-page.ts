import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import type { AtsReport } from '../../core/models/app.models';
import type { Resume } from '../../core/models/resume.models';
import { AiService } from '../../core/services/ai.service';
import { AtsService } from '../../core/services/ats.service';
import { ResumeService } from '../../core/services/resume.service';
import { DialogService, ToastService } from '../../core/services/ui.service';
import { formatBytes } from '../../core/utils/files';
import { errorMessage } from '../../core/utils/http';
import { FileDrop } from '../../shared/ui/file-drop';
import { scoreColor } from '../../shared/ui/score-ring';
import { AtsReportView } from './ats-report-view';

const STEPS = ['Reading your document…', 'Extracting text like an ATS…', 'Matching keywords…', 'Scoring 7 categories…'];

@Component({
  selector: 'app-ats-page',
  imports: [FormsModule, RouterLink, DatePipe, FileDrop, AtsReportView],
  templateUrl: './ats-page.html',
  styleUrl: './ats-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtsPage implements OnInit {
  protected readonly ai = inject(AiService);
  private readonly ats = inject(AtsService);
  private readonly resumeService = inject(ResumeService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  /** Route param when viewing a saved report. */
  readonly reportId = input<string>();
  /** Query param to preselect a builder resume. */
  readonly resume = input<string>();

  protected readonly source = signal<'file' | 'resume' | 'text'>('file');
  protected readonly file = signal<File | null>(null);
  protected readonly resumes = signal<Resume[]>([]);
  protected readonly resumeId = signal('');
  protected readonly text = signal('');
  protected readonly jobTitle = signal('');
  protected readonly jobDescription = signal('');
  protected readonly useAi = signal(false);

  protected readonly analyzing = signal(false);
  protected readonly step = signal(0);
  protected readonly report = signal<AtsReport | null>(null);
  protected readonly loadingReport = signal(false);
  protected readonly history = signal<AtsReport[]>([]);

  protected readonly formatBytes = formatBytes;
  protected readonly scoreColor = scoreColor;
  protected readonly steps = STEPS;

  constructor() {
    effect(() => {
      const id = this.reportId();
      if (!id) {
        this.report.set(null);
        return;
      }
      this.loadingReport.set(true);
      this.ats.report(id).subscribe({
        next: (report) => {
          this.report.set(report);
          this.loadingReport.set(false);
        },
        error: (e: unknown) => {
          this.loadingReport.set(false);
          this.toast.error(errorMessage(e));
        },
      });
    });

    effect(() => {
      const preselect = this.resume();
      if (preselect) {
        this.source.set('resume');
        this.resumeId.set(preselect);
      }
    });

    effect(() => {
      if (this.ai.enabled()) this.useAi.set(true);
    });
  }

  ngOnInit(): void {
    this.resumeService.list().subscribe({
      next: (list) => {
        this.resumes.set(list);
        if (!this.resumeId() && list.length) this.resumeId.set(list[0].id);
      },
      error: () => undefined,
    });
    this.loadHistory();
  }

  protected onFiles(files: File[]): void {
    this.file.set(files[0] ?? null);
  }

  protected analyze(): void {
    const options = { jobDescription: this.jobDescription(), jobTitle: this.jobTitle(), useAi: this.useAi() };
    let request: Observable<AtsReport>;
    switch (this.source()) {
      case 'file': {
        const file = this.file();
        if (!file) return this.toast.info('Choose a resume file first.');
        request = this.ats.analyzeFile(file, options);
        break;
      }
      case 'resume':
        if (!this.resumeId()) return this.toast.info('Pick one of your resumes.');
        request = this.ats.analyzeResume(this.resumeId(), options);
        break;
      default:
        if (this.text().trim().length < 50) return this.toast.info('Paste your full resume text (at least 50 characters).');
        request = this.ats.analyzeText(this.text(), options);
    }

    this.analyzing.set(true);
    this.step.set(0);
    const timer = setInterval(() => this.step.update((s) => Math.min(STEPS.length - 1, s + 1)), 900);
    request.subscribe({
      next: (report) => {
        clearInterval(timer);
        this.analyzing.set(false);
        this.loadHistory();
        void this.router.navigate(['/app/ats', report.id]);
      },
      error: (e: unknown) => {
        clearInterval(timer);
        this.analyzing.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  protected async removeReport(report: AtsReport, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const confirmed = await this.dialogs.confirm({ title: 'Delete this scan?', confirmText: 'Delete', danger: true });
    if (!confirmed) return;
    this.ats.remove(report.id).subscribe({
      next: () => {
        this.history.update((list) => list.filter((r) => r.id !== report.id));
        if (this.reportId() === report.id) void this.router.navigateByUrl('/app/ats');
      },
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  private loadHistory(): void {
    this.ats.reports().subscribe({ next: (list) => this.history.set(list), error: () => undefined });
  }
}
