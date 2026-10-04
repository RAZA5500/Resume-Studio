import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { DocumentFile, ExtractionResult } from '../../core/models/app.models';
import { BillingService } from '../../core/services/billing.service';
import { ExportService } from '../../core/services/export.service';
import { DocumentService } from '../../core/services/document.service';
import { DialogService, ToastService } from '../../core/services/ui.service';
import { downloadBlob, formatBytes, pickFile, timeAgo } from '../../core/utils/files';
import { watermarkCanvas } from '../../core/utils/watermark';
import { errorMessage, errorMessageAsync } from '../../core/utils/http';
import {
  canvasToBlob,
  extractPdfPages,
  imagesToPdf,
  mergePdfs,
  openPdf,
  pdfBlob,
  renderPdfPage,
  textToHtml,
} from '../../core/utils/pdf';
import { ClickOutside } from '../../shared/ui/click-outside';
import { PointerFx } from '../../shared/motion/pointer-fx';
import { Reveal } from '../../shared/motion/reveal';
import { FileDrop } from '../../shared/ui/file-drop';

interface Tool {
  key: string;
  icon: string;
  title: string;
  description: string;
}

const TOOLS: Tool[] = [
  { key: 'merge', icon: 'call_merge', title: 'Merge PDFs', description: 'Combine several PDFs into one file' },
  { key: 'split', icon: 'content_cut', title: 'Extract pages', description: 'Pull specific pages out of a PDF' },
  { key: 'img2pdf', icon: 'picture_as_pdf', title: 'Images → PDF', description: 'Turn JPG/PNG photos into a PDF' },
  { key: 'pdf2img', icon: 'image', title: 'PDF → Images', description: 'Export every page as PNG' },
  { key: 'word2pdf', icon: 'description', title: 'Word → PDF', description: 'Convert .docx to a PDF' },
  { key: 'pdf2word', icon: 'edit_note', title: 'PDF → Word', description: 'Editable .docx from a PDF' },
  { key: 'ocr', icon: 'document_scanner', title: 'Image → Text (OCR)', description: 'Extract text from photos & scans' },
];

@Component({
  selector: 'app-documents-page',
  imports: [FormsModule, RouterLink, FileDrop, UpperCasePipe, ClickOutside, PointerFx, Reveal],
  templateUrl: './documents-page.html',
  styleUrl: './documents-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage implements OnInit {
  private readonly documents = inject(DocumentService);
  protected readonly billing = inject(BillingService);
  private readonly exporter = inject(ExportService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  protected readonly tools = TOOLS;
  protected readonly list = signal<DocumentFile[]>([]);
  protected readonly loading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly busyTool = signal<string | null>(null);
  protected readonly menuFor = signal<string | null>(null);
  protected readonly ocrResult = signal<(ExtractionResult & { name: string }) | null>(null);
  protected readonly formatBytes = formatBytes;
  protected readonly timeAgo = timeAgo;

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    this.documents.list().subscribe({
      next: (docs) => {
        this.list.set(docs);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loading.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  protected async upload(files: File[]): Promise<void> {
    if (!files.length) return;
    this.uploading.set(true);
    let last: DocumentFile | null = null;
    let uploaded = 0;
    for (const file of files) {
      try {
        last = await firstValueFrom(this.documents.upload(file, file.name));
        uploaded++;
      } catch (e) {
        // An empty message means the free daily limit was hit; the upgrade dialog is already open.
        const message = errorMessage(e);
        if (!message) break;
        this.toast.error(`${file.name}: ${message}`);
      }
    }
    this.uploading.set(false);
    this.billing.refresh(true);
    if (files.length === 1 && last) {
      void this.router.navigate(['/editor', last.id]);
    } else if (uploaded) {
      this.refresh();
      this.toast.success(`${uploaded} file${uploaded === 1 ? '' : 's'} uploaded`);
    }
  }

  protected async createBlank(kind: 'rich' | 'canvas', size?: 'a4' | 'letter' | 'custom'): Promise<void> {
    let width = 794;
    let height = 1123;
    if (size === 'letter') [width, height] = [816, 1056];
    if (size === 'custom') {
      const value = await this.dialogs.prompt({
        title: 'Custom canvas size',
        label: 'Width × height in pixels',
        value: '1080x1080',
        placeholder: '1080x1080',
      });
      if (!value) return;
      const match = /(\d+)\s*[x×*,]\s*(\d+)/.exec(value);
      if (!match) return this.toast.error('Use the format 1080x1080');
      [width, height] = [Math.min(5000, Number(match[1])), Math.min(5000, Number(match[2]))];
    }
    const name = kind === 'rich' ? 'Untitled document' : `Untitled design ${width}×${height}`;
    this.documents.create({ name, kind, width, height }).subscribe({
      next: (doc) => void this.router.navigate(['/editor', doc.id]),
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  protected icon(doc: DocumentFile): string {
    return { pdf: 'picture_as_pdf', image: 'image', rich: 'article', canvas: 'draw' }[doc.kind] ?? 'description';
  }

  protected closeMenu(id: string): void {
    if (this.menuFor() === id) this.menuFor.set(null);
  }

  protected async rename(doc: DocumentFile): Promise<void> {
    this.menuFor.set(null);
    const name = await this.dialogs.prompt({ title: 'Rename document', label: 'Name', value: doc.name });
    if (!name || name === doc.name) return;
    this.documents.update(doc.id, { name }).subscribe({
      next: (updated) => this.list.update((list) => list.map((d) => (d.id === doc.id ? { ...d, name: updated.name } : d))),
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  protected downloadOriginal(doc: DocumentFile): void {
    this.menuFor.set(null);
    this.documents.fileBlob(doc.id).subscribe({
      next: (blob) => downloadBlob(blob, doc.originalName ?? `${doc.name}.${doc.sourceFormat ?? 'bin'}`),
      error: async (e: unknown) => this.toast.error(await errorMessageAsync(e)),
    });
  }

  protected async remove(doc: DocumentFile): Promise<void> {
    this.menuFor.set(null);
    const confirmed = await this.dialogs.confirm({
      title: 'Delete document?',
      message: `"${doc.name}" and its edits will be permanently deleted.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.documents.remove(doc.id).subscribe({
      next: () => this.list.update((list) => list.filter((d) => d.id !== doc.id)),
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  // ------------------------------------------------------------------ tools
  protected async runTool(key: string): Promise<void> {
    if (this.busyTool()) return;
    try {
      switch (key) {
        case 'merge': {
          const files = await pickFile('application/pdf,.pdf', true);
          if (files.length < 2) return files.length ? this.toast.info('Select at least two PDFs to merge.') : undefined;
          this.busyTool.set(key);
          downloadBlob(pdfBlob(await this.exporter.stampPdf(await mergePdfs(files))), 'merged.pdf');
          this.toast.success(`Merged ${files.length} PDFs`);
          break;
        }
        case 'split': {
          const [file] = await pickFile('application/pdf,.pdf');
          if (!file) return;
          const ranges = await this.dialogs.prompt({
            title: 'Extract pages',
            label: 'Pages to keep',
            value: '1-2',
            placeholder: 'e.g. 1-3, 5, 8-10',
          });
          if (!ranges) return;
          this.busyTool.set(key);
          downloadBlob(pdfBlob(await this.exporter.stampPdf(await extractPdfPages(file, ranges))), `${file.name.replace(/\.pdf$/i, '')}-pages.pdf`);
          break;
        }
        case 'img2pdf': {
          const files = await pickFile('image/*', true);
          if (!files.length) return;
          this.busyTool.set(key);
          downloadBlob(pdfBlob(await this.exporter.stampPdf(await imagesToPdf(files))), 'images.pdf');
          this.toast.success(`Created a ${files.length}-page PDF`);
          break;
        }
        case 'pdf2img': {
          const [file] = await pickFile('application/pdf,.pdf');
          if (!file) return;
          this.busyTool.set(key);
          const pdf = await openPdf(await file.arrayBuffer());
          const count = Math.min(pdf.numPages, 30);
          for (let p = 1; p <= count; p++) {
            const canvas = await renderPdfPage(pdf, p, 2);
            if (this.exporter.watermarked()) watermarkCanvas(canvas);
            downloadBlob(await canvasToBlob(canvas), `${file.name.replace(/\.pdf$/i, '')}-page-${p}.png`);
          }
          this.toast.success(`Exported ${count} page${count > 1 ? 's' : ''} as PNG`);
          break;
        }
        case 'word2pdf':
        case 'pdf2word': {
          const toPdf = key === 'word2pdf';
          const [file] = await pickFile(toPdf ? '.docx,.doc,.txt,.rtf,.html,.md' : '.pdf,image/*');
          if (!file) return;
          this.busyTool.set(key);
          const blob = await firstValueFrom(this.documents.convert(file, toPdf ? 'pdf' : 'docx'));
          downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, '')}.${toPdf ? 'pdf' : 'docx'}`);
          this.toast.success('Converted!');
          break;
        }
        case 'ocr': {
          const [file] = await pickFile('image/*,.pdf');
          if (!file) return;
          this.busyTool.set(key);
          const result = await firstValueFrom(this.documents.extractFromFile(file));
          this.ocrResult.set({ ...result, name: file.name });
          break;
        }
      }
    } catch (e) {
      this.toast.error(await errorMessageAsync(e));
    } finally {
      this.busyTool.set(null);
    }
  }

  protected async copyOcr(): Promise<void> {
    const text = this.ocrResult()?.text ?? '';
    await navigator.clipboard.writeText(text).catch(() => undefined);
    this.toast.success('Text copied');
  }

  protected saveOcrAsDocument(): void {
    const result = this.ocrResult();
    if (!result) return;
    this.documents
      .create({ name: `${result.name.replace(/\.[^.]+$/, '')} (text)`, kind: 'rich', html: textToHtml(result.text) })
      .subscribe({
        next: (doc) => void this.router.navigate(['/editor', doc.id]),
        error: (e: unknown) => this.toast.error(errorMessage(e)),
      });
  }
}
