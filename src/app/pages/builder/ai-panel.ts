import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AtsReport, TailorResult } from '../../core/models/app.models';
import type { ResumeContent } from '../../core/models/resume.models';
import { AiService } from '../../core/services/ai.service';
import { AtsService } from '../../core/services/ats.service';
import { DialogService, ToastService } from '../../core/services/ui.service';
import { pickFile } from '../../core/utils/files';
import { errorMessage } from '../../core/utils/http';
import { ScoreRing } from '../../shared/ui/score-ring';
import { BuilderStore } from './builder-store';

function withoutPhoto(content: ResumeContent): ResumeContent {
  return { ...content, personal: { ...content.personal, photo: '' } };
}

@Component({
  selector: 'app-ai-panel',
  imports: [FormsModule, RouterLink, ScoreRing],
  templateUrl: './ai-panel.html',
  styleUrl: './ai-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiPanel {
  protected readonly store = inject(BuilderStore);
  protected readonly ai = inject(AiService);
  private readonly ats = inject(AtsService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal<string | null>(null);

  protected readonly prompt = signal('');
  protected readonly targetRole = signal('');

  protected readonly jobDescription = signal('');
  protected readonly tailorResult = signal<TailorResult | null>(null);

  protected readonly atsJd = signal('');
  protected readonly atsUseAi = signal(false);
  protected readonly report = signal<AtsReport | null>(null);

  protected async generate(): Promise<void> {
    if (this.prompt().trim().length < 10) {
      this.toast.info('Describe your background in at least a sentence.');
      return;
    }
    const replace = await this.dialogs.confirm({
      title: 'Replace resume content?',
      message: 'The AI draft will replace the current sections. You can undo this with Ctrl+Z.',
      confirmText: 'Generate & replace',
    });
    if (!replace) return;
    this.busy.set('generate');
    this.ai.generateResume(this.prompt(), this.targetRole(), undefined, this.store.id() ?? undefined).subscribe({
      next: ({ content, source }) => {
        const current = this.store.content().personal;
        for (const key of Object.keys(content.personal) as Array<keyof ResumeContent['personal']>) {
          if (!content.personal[key] && current[key]) content.personal[key] = current[key];
        }
        this.store.replaceContent(content);
        this.busy.set(null);
        this.toast.success(source === 'ai' ? 'AI draft ready — review every line before sending.' : 'Draft generated in offline mode.');
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected tailor(): void {
    if (this.jobDescription().trim().length < 30) {
      this.toast.info('Paste the full job description first.');
      return;
    }
    this.busy.set('tailor');
    this.tailorResult.set(null);
    this.ai.tailor(withoutPhoto(this.store.content()), this.jobDescription()).subscribe({
      next: (result) => {
        this.tailorResult.set(result);
        this.busy.set(null);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected applyTailor(): void {
    const result = this.tailorResult();
    if (!result) return;
    const photo = this.store.content().personal.photo;
    result.content.personal.photo = photo;
    this.store.replaceContent(result.content);
    this.tailorResult.set(null);
    this.toast.success('Tailored version applied. Tip: duplicate your resume to keep one version per job.');
  }

  protected async checkAts(): Promise<void> {
    const id = this.store.id();
    if (!id) return;
    this.busy.set('ats');
    await this.store.flush();
    this.ats.analyzeResume(id, { jobDescription: this.atsJd(), useAi: this.atsUseAi() }).subscribe({
      next: (report) => {
        this.report.set(report);
        this.store.atsScore.set(report.score);
        this.busy.set(null);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected async importFile(): Promise<void> {
    const [file] = await pickFile('.pdf,.docx,.doc,.txt,.rtf,.png,.jpg,.jpeg,.webp');
    if (!file) return;
    const replace = await this.dialogs.confirm({
      title: 'Import from file?',
      message: `Content from "${file.name}" will replace the current sections (undo with Ctrl+Z).`,
      confirmText: 'Import',
    });
    if (!replace) return;
    this.busy.set('import');
    this.ai.parseResume(file, this.store.id() ?? undefined).subscribe({
      next: ({ content, warnings }) => {
        content.personal.photo = this.store.content().personal.photo;
        this.store.replaceContent(content);
        this.busy.set(null);
        this.toast.success('Resume imported');
        warnings.forEach((w) => this.toast.warning(w));
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private fail(error: unknown): void {
    this.busy.set(null);
    this.toast.error(errorMessage(error));
  }
}
