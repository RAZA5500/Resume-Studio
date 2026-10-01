import { ChangeDetectionStrategy, Component, effect, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Resume } from '../../core/models/resume.models';
import { AiService } from '../../core/services/ai.service';
import { BillingService } from '../../core/services/billing.service';
import { DocumentService } from '../../core/services/document.service';
import { ExportService } from '../../core/services/export.service';
import { ResumeService } from '../../core/services/resume.service';
import { ToastService } from '../../core/services/ui.service';
import { downloadBlob, downloadText, safeFileName } from '../../core/utils/files';
import { errorMessage, errorMessageAsync } from '../../core/utils/http';
import { textToHtml } from '../../core/utils/pdf';

@Component({
  selector: 'app-cover-letter-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './cover-letter-page.html',
  styleUrl: './cover-letter-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoverLetterPage implements OnInit {
  protected readonly ai = inject(AiService);
  protected readonly billing = inject(BillingService);
  private readonly resumes = inject(ResumeService);
  private readonly exporter = inject(ExportService);
  private readonly documents = inject(DocumentService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Query param to preselect a resume. */
  readonly resume = input<string>();

  protected readonly list = signal<Resume[]>([]);
  protected readonly resumeId = signal('');
  protected readonly company = signal('');
  protected readonly hiringManager = signal('');
  protected readonly tone = signal('professional');
  protected readonly jobDescription = signal('');
  protected readonly subject = signal('');
  protected readonly body = signal('');
  protected readonly generating = signal(false);
  protected readonly exporting = signal(false);

  constructor() {
    effect(() => {
      const id = this.resume();
      if (id) this.resumeId.set(id);
    });
  }

  ngOnInit(): void {
    this.resumes.list().subscribe({
      next: (list) => {
        this.list.set(list);
        if (!this.resumeId() && list.length) this.resumeId.set(list[0].id);
      },
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  protected generate(): void {
    if (!this.resumeId()) return this.toast.info('Create a resume first — the letter is written from it.');
    if (this.jobDescription().trim().length < 20) return this.toast.info('Paste the job description.');
    this.generating.set(true);
    this.ai
      .coverLetter({
        resumeId: this.resumeId(),
        jobDescription: this.jobDescription(),
        company: this.company() || undefined,
        hiringManager: this.hiringManager() || undefined,
        tone: this.tone(),
      })
      .subscribe({
        next: (result) => {
          this.subject.set(result.subject);
          this.body.set(result.body);
          this.generating.set(false);
          this.billing.refresh(true);
        },
        error: (e: unknown) => {
          this.generating.set(false);
          this.toast.error(errorMessage(e));
        },
      });
  }

  private fileBase(): string {
    return safeFileName(`Cover Letter${this.company() ? ' - ' + this.company() : ''}`, 'cover-letter');
  }

  private html(): string {
    return this.exporter.buildDocumentHtml(textToHtml(this.body()), this.fileBase());
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.body()).catch(() => undefined);
    this.toast.success('Cover letter copied');
  }

  protected download(format: 'pdf' | 'docx' | 'txt'): void {
    if (format === 'txt') return downloadText(this.body(), `${this.fileBase()}.txt`);
    this.exporting.set(true);
    const request = format === 'pdf' ? this.exporter.pdf(this.html(), this.fileBase()) : this.exporter.docx(this.html(), this.fileBase());
    request.subscribe({
      next: (blob) => {
        downloadBlob(blob, `${this.fileBase()}.${format}`);
        this.exporting.set(false);
      },
      error: async (e: unknown) => {
        this.exporting.set(false);
        this.toast.error(await errorMessageAsync(e));
      },
    });
  }

  protected openInEditor(): void {
    this.documents.create({ name: this.fileBase(), kind: 'rich', html: textToHtml(this.body()) }).subscribe({
      next: (doc) => void this.router.navigate(['/editor', doc.id]),
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }
}
