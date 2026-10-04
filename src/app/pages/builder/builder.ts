import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Template } from '../../core/models/app.models';
import { ExportService } from '../../core/services/export.service';
import { ResumeService } from '../../core/services/resume.service';
import { ToastService } from '../../core/services/ui.service';
import { downloadBlob, safeFileName } from '../../core/utils/files';
import { errorMessage, errorMessageAsync } from '../../core/utils/http';
import { ResumeRenderer } from '../../shared/resume/resume-renderer';
import { ClickOutside } from '../../shared/ui/click-outside';
import { TemplateGallery } from '../templates/template-gallery';
import { AiPanel } from './ai-panel';
import { BuilderStore } from './builder-store';
import { ContentEditor } from './content-editor';
import { DesignPanel } from './design-panel';

const MM_TO_PX = 96 / 25.4;

@Component({
  selector: 'app-builder',
  imports: [FormsModule, RouterLink, ResumeRenderer, ContentEditor, DesignPanel, AiPanel, TemplateGallery, ClickOutside],
  providers: [BuilderStore],
  templateUrl: './builder.html',
  styleUrl: './builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Builder implements OnDestroy {
  /** Route parameter. */
  readonly id = input.required<string>();

  protected readonly store = inject(BuilderStore);
  private readonly resumes = inject(ResumeService);
  private readonly exporter = inject(ExportService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly tab = signal<'content' | 'design' | 'ai'>('content');
  protected readonly mobileView = signal<'edit' | 'preview'>('edit');
  protected readonly downloadMenu = signal(false);
  protected readonly exporting = signal<string | null>(null);
  protected readonly pickerOpen = signal(false);

  protected readonly zoomMode = signal<'fit' | 'manual'>('fit');
  protected readonly manualZoom = signal(1);
  private readonly previewWidth = signal(900);
  protected readonly resumeHeight = signal(1123);

  private readonly previewArea = viewChild<ElementRef<HTMLElement>>('previewArea');
  private readonly paper = viewChild<ElementRef<HTMLElement>>('paper');

  protected readonly pageWidthPx = computed(() => (this.store.design().pageSize === 'Letter' ? 215.9 : 210) * MM_TO_PX);
  protected readonly zoom = computed(() => {
    if (this.zoomMode() === 'manual') return this.manualZoom();
    return Math.min(1.1, Math.max(0.35, (this.previewWidth() - 56) / this.pageWidthPx()));
  });

  /** y positions (px, unscaled) where the printed PDF will break onto a new page. */
  protected readonly pageBreaks = computed(() => {
    const d = this.store.design();
    const pageHeight = d.pageSize === 'Letter' ? 279.4 : 297;
    const margin = d.margin;
    const printedHeight = this.resumeHeight() / MM_TO_PX - margin;
    const breaks: number[] = [];
    let y = pageHeight - margin;
    while (y < printedHeight - 1 && breaks.length < 12) {
      breaks.push(y * MM_TO_PX);
      y += pageHeight - 2 * margin;
    }
    return breaks;
  });
  protected readonly pageCount = computed(() => this.pageBreaks().length + 1);

  constructor() {
    effect(() => {
      const id = this.id();
      this.loading.set(true);
      this.resumes.get(id).subscribe({
        next: (resume) => {
          this.store.load(resume);
          this.loading.set(false);
        },
        error: (e: unknown) => {
          this.loadError.set(errorMessage(e, 'Resume not found'));
          this.loading.set(false);
        },
      });
    });

    effect((onCleanup) => {
      const area = this.previewArea()?.nativeElement;
      if (!area) return;
      const observer = new ResizeObserver(([entry]) => this.previewWidth.set(entry.contentRect.width));
      observer.observe(area);
      onCleanup(() => observer.disconnect());
    });

    effect((onCleanup) => {
      const paper = this.paper()?.nativeElement;
      if (!paper) return;
      const measure = () => {
        const rz = paper.querySelector<HTMLElement>('.rz');
        if (rz) this.resumeHeight.set(rz.offsetHeight);
      };
      const observer = new ResizeObserver(measure);
      observer.observe(paper);
      measure();
      onCleanup(() => observer.disconnect());
    });
  }

  ngOnDestroy(): void {
    void this.store.flush();
  }

  // ------------------------------------------------------------------ zoom
  protected zoomBy(delta: number): void {
    this.manualZoom.set(Math.min(2, Math.max(0.3, Math.round((this.zoom() + delta) * 100) / 100)));
    this.zoomMode.set('manual');
  }

  protected fit(): void {
    this.zoomMode.set('fit');
  }

  // ------------------------------------------------------------------ template picker
  protected applyTemplate(template: Template): void {
    this.store.replaceDesign(template.config, template.id);
    this.pickerOpen.set(false);
    this.toast.success(`Applied "${template.name}"`);
  }

  // ------------------------------------------------------------------ exports
  private exportHtml(): string | null {
    const element = this.paper()?.nativeElement.querySelector<HTMLElement>('.rz');
    if (!element) return null;
    return this.exporter.buildResumeHtml(element, this.store.design(), this.store.title());
  }

  private fileBase(): string {
    const name = this.store.content().personal.fullName.trim();
    return safeFileName(name ? `${name} - Resume` : this.store.title(), 'resume');
  }

  protected async downloadPdf(): Promise<void> {
    this.downloadMenu.set(false);
    const html = this.exportHtml();
    if (!html) return;
    this.exporting.set('pdf');
    void this.store.flush();
    this.exporter.pdf(html, this.fileBase(), this.store.design().pageSize).subscribe({
      next: (blob) => {
        downloadBlob(blob, `${this.fileBase()}.pdf`);
        this.exporting.set(null);
        this.toast.success('PDF downloaded — text is selectable and ATS readable.');
      },
      error: async (e: unknown) => {
        this.exporting.set(null);
        if (e instanceof HttpErrorResponse && e.status === 503) {
          this.toast.warning('Server PDF engine unavailable — opening the print dialog instead. Choose "Save as PDF".');
          this.exporter.print(html);
        } else {
          this.toast.error(await errorMessageAsync(e));
        }
      },
    });
  }

  protected print(): void {
    this.downloadMenu.set(false);
    const html = this.exportHtml();
    if (html) this.exporter.print(html);
  }

  protected async downloadDocx(): Promise<void> {
    this.downloadMenu.set(false);
    const id = this.store.id();
    if (!id) return;
    this.exporting.set('docx');
    await this.store.flush();
    this.resumes.exportDocx(id).subscribe({
      next: (blob) => {
        downloadBlob(blob, `${this.fileBase()}.docx`);
        this.exporting.set(null);
      },
      error: async (e: unknown) => {
        this.exporting.set(null);
        this.toast.error(await errorMessageAsync(e));
      },
    });
  }

  protected async downloadText(): Promise<void> {
    this.downloadMenu.set(false);
    const id = this.store.id();
    if (!id) return;
    await this.store.flush();
    this.resumes.exportText(id).subscribe({
      next: (blob) => downloadBlob(blob, `${this.fileBase()}.txt`),
      error: async (e: unknown) => this.toast.error(await errorMessageAsync(e)),
    });
  }

  protected openAts(): void {
    this.tab.set('ai');
    this.mobileView.set('edit');
  }

  protected async back(): Promise<void> {
    await this.store.flush();
    void this.router.navigateByUrl('/app/dashboard');
  }

  // ------------------------------------------------------------------ keyboard & unload
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const target = event.target as HTMLElement | null;
    const typing = !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      void this.store.flush().then(() => this.toast.success('Saved'));
    } else if (!typing && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.store.undo();
    } else if (!typing && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.store.redo();
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    // 'error' too: a failed save means the latest edits only exist in this tab.
    if (this.store.saveState() !== 'saved') {
      void this.store.flush();
      event.preventDefault();
    }
  }
}
