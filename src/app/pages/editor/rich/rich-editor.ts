import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Quill from 'quill';
import { firstValueFrom } from 'rxjs';
import type { DocumentFile, ImproveMode } from '../../../core/models/app.models';
import { AiService } from '../../../core/services/ai.service';
import { DocumentService } from '../../../core/services/document.service';
import { ExportService } from '../../../core/services/export.service';
import { DialogService, ToastService } from '../../../core/services/ui.service';
import { downloadBlob, downloadText, safeFileName } from '../../../core/utils/files';
import { errorMessage, errorMessageAsync, isLimitReached } from '../../../core/utils/http';
import { ClickOutside } from '../../../shared/ui/click-outside';

const FONTS: Record<string, string> = {
  inter: 'Inter, sans-serif',
  roboto: 'Roboto, sans-serif',
  lato: 'Lato, sans-serif',
  poppins: 'Poppins, sans-serif',
  lora: 'Lora, serif',
  merriweather: 'Merriweather, serif',
  playfair: "'Playfair Display', serif",
  garamond: "'EB Garamond', serif",
  mono: "'JetBrains Mono', monospace",
};
const SIZES = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px', '48px'];

let registered = false;
function registerFormats(): void {
  if (registered) return;
  registered = true;
  const Font = Quill.import('formats/font') as { whitelist: string[] };
  Font.whitelist = Object.keys(FONTS);
  Quill.register(Font as never, true);
  const Size = Quill.import('attributors/style/size') as { whitelist: string[] };
  Size.whitelist = SIZES;
  Quill.register(Size as never, true);
}

/** Converts Quill's class based formatting to inline styles so Word/PDF exports keep it. */
function inlineQuillClasses(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll<HTMLElement>('[class]').forEach((el) => {
    for (const cls of Array.from(el.classList)) {
      let match: RegExpExecArray | null;
      if ((match = /^ql-align-(\w+)$/.exec(cls))) el.style.textAlign = match[1];
      else if ((match = /^ql-indent-(\d+)$/.exec(cls))) el.style.marginLeft = `${Number(match[1]) * 3}em`;
      else if ((match = /^ql-font-(\w+)$/.exec(cls))) el.style.fontFamily = FONTS[match[1]] ?? '';
      else if (cls === 'ql-direction-rtl') el.style.direction = 'rtl';
      else continue;
      el.classList.remove(cls);
    }
    if (!el.classList.length) el.removeAttribute('class');
  });
  return doc.body.innerHTML;
}

@Component({
  selector: 'app-rich-editor',
  imports: [FormsModule, ClickOutside],
  templateUrl: './rich-editor.html',
  styleUrl: './rich-editor.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RichEditor {
  private readonly documents = inject(DocumentService);
  private readonly exporter = inject(ExportService);
  protected readonly ai = inject(AiService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly doc = input.required<DocumentFile>();

  protected readonly name = signal('');
  /** 'limit': the free daily document-edit limit was reached, so auto-save is paused. */
  protected readonly saveState = signal<'saved' | 'saving' | 'dirty' | 'error' | 'limit'>('saved');
  protected readonly words = signal(0);
  protected readonly chars = signal(0);
  protected readonly aiMenu = signal(false);
  protected readonly exportMenu = signal(false);
  protected readonly aiBusy = signal(false);
  protected readonly exporting = signal(false);
  protected readonly ready = signal(false);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('editor');
  private quill: Quill | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Incremented on every edit; compared with the last saved version. */
  private version = 0;
  private savedVersion = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => void this.init());
    destroyRef.onDestroy(() => {
      if (this.version !== this.savedVersion && this.saveState() !== 'limit') void this.save();
    });
  }

  private async init(): Promise<void> {
    registerFormats();
    const doc = this.doc();
    this.name.set(doc.name);
    this.quill = new Quill(this.host().nativeElement, {
      theme: 'snow',
      placeholder: 'Start writing…',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          [{ font: Object.keys(FONTS) }, { size: [false, ...SIZES] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ script: 'sub' }, { script: 'super' }],
          [{ align: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
          [{ indent: '-1' }, { indent: '+1' }],
          ['blockquote', 'code-block', 'link', 'image'],
          ['clean'],
        ],
        history: { delay: 800, maxStack: 200, userOnly: true },
      },
    });

    let html = (doc.editorState as { html?: string } | null | undefined)?.html;
    if (!html && doc.sourceFormat) {
      try {
        html = (await firstValueFrom(this.documents.html(doc.id))).html;
      } catch (e) {
        this.toast.error(errorMessage(e, 'Could not convert this file'));
      }
    }
    if (html) this.quill.clipboard.dangerouslyPasteHTML(html, 'silent');
    this.quill.history.clear();
    this.updateCounts();
    this.ready.set(true);

    this.quill.on('text-change', (_delta, _old, source) => {
      this.updateCounts();
      if (source === 'user' || source === 'api') this.scheduleSave();
    });
  }

  private updateCounts(): void {
    const text = this.quill?.getText() ?? '';
    this.chars.set(text.replace(/\s/g, '').length);
    this.words.set(text.split(/\s+/).filter((w) => w.length > 0).length);
  }

  private scheduleSave(): void {
    this.version++;
    if (this.saveState() === 'limit') return;
    this.saveState.set('dirty');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 1000);
  }

  protected async save(): Promise<void> {
    if (!this.quill) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const version = this.version;
    this.saveState.set('saving');
    try {
      await firstValueFrom(
        this.documents.update(this.doc().id, {
          name: this.name().trim() || 'Untitled document',
          editorState: { html: this.quill.root.innerHTML },
        }),
      );
      this.savedVersion = Math.max(this.savedVersion, version);
      // Newer edits made while saving keep the document marked as unsaved.
      this.saveState.set(this.version === version ? 'saved' : 'dirty');
    } catch (e) {
      this.saveState.set(isLimitReached(e) ? 'limit' : 'error');
    }
  }

  protected rename(value: string): void {
    this.name.set(value);
    this.scheduleSave();
  }

  protected async back(): Promise<void> {
    if (this.version !== this.savedVersion && this.saveState() !== 'limit') await this.save();
    void this.router.navigateByUrl('/app/documents');
  }

  // ------------------------------------------------------------------ AI
  protected async aiRewrite(mode: ImproveMode): Promise<void> {
    this.aiMenu.set(false);
    const quill = this.quill;
    if (!quill) return;
    const range = quill.getSelection(true);
    if (!range || range.length === 0) {
      this.toast.info('Select the text you want the AI to rewrite.');
      return;
    }
    let instruction: string | undefined;
    if (mode === 'custom') {
      const value = await this.dialogs.prompt({
        title: 'AI instruction',
        label: 'What should the AI do with the selected text?',
        placeholder: 'e.g. Translate to Urdu · Make it more formal · Turn into bullet points',
      });
      if (!value) return;
      instruction = value;
    }
    const text = quill.getText(range.index, range.length);
    this.aiBusy.set(true);
    this.ai.improve(text, mode, instruction).subscribe({
      next: (result) => {
        quill.deleteText(range.index, range.length, 'user');
        quill.insertText(range.index, result.text, 'user');
        quill.setSelection(range.index, result.text.length, 'silent');
        this.aiBusy.set(false);
      },
      error: (e: unknown) => {
        this.aiBusy.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  // ------------------------------------------------------------------ export
  private exportHtml(): string {
    const body = inlineQuillClasses(this.quill?.getSemanticHTML() ?? '');
    return this.exporter.buildDocumentHtml(body, this.name());
  }

  private fileBase(): string {
    return safeFileName(this.name(), 'document');
  }

  protected exportAs(format: 'pdf' | 'docx' | 'html' | 'txt'): void {
    this.exportMenu.set(false);
    if (!this.quill) return;
    if (format === 'txt') return downloadText(this.quill.getText(), `${this.fileBase()}.txt`);
    const html = this.exportHtml();
    if (format === 'html') return downloadText(html, `${this.fileBase()}.html`, 'text/html;charset=utf-8');
    this.exporting.set(true);
    const request = format === 'pdf' ? this.exporter.pdf(html, this.fileBase()) : this.exporter.docx(html, this.fileBase());
    request.subscribe({
      next: (blob) => {
        downloadBlob(blob, `${this.fileBase()}.${format}`);
        this.exporting.set(false);
      },
      error: async (e: unknown) => {
        this.exporting.set(false);
        this.toast.error(await errorMessageAsync(e));
        if (format === 'pdf') this.exporter.print(html);
      },
    });
  }

  protected print(): void {
    this.exportMenu.set(false);
    this.exporter.print(this.exportHtml());
  }
}
