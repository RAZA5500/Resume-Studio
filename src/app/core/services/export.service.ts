import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { nativeHooks } from '../native/platform';
import { RESUME_CSS } from '../../shared/resume/resume-styles';
import { type DesignSettings, TWO_COLUMN_LAYOUTS } from '../models/resume.models';
import { escapeHtml } from '../utils/files';
import { googleFontsUrl } from '../utils/fonts';
import { watermarkDataUrl, watermarkHtml, watermarkPdf, watermarkText } from '../utils/watermark';
import { BillingService } from './billing.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly http = inject(HttpClient);
  private readonly billing = inject(BillingService);

  /** Free plan exports are watermarked; Lifetime removes it. The server enforces this for its own exports. */
  readonly watermarked = computed(() => !this.billing.isLifetime());

  /** Applies the free plan watermark to files built in the browser. */
  stampPdf(bytes: Uint8Array): Promise<Uint8Array> {
    return this.watermarked() ? watermarkPdf(bytes) : Promise.resolve(bytes);
  }

  stampHtml(html: string): string {
    return this.watermarked() ? watermarkHtml(html) : html;
  }

  stampText(text: string): string {
    return this.watermarked() ? watermarkText(text) : text;
  }

  stampImage(dataUrl: string, type: string, quality?: number): Promise<string> {
    return this.watermarked() ? watermarkDataUrl(dataUrl, type, quality) : Promise.resolve(dataUrl);
  }

  /** Server side HTML → PDF (real text, ATS readable). */
  pdf(html: string, fileName: string, pageSize: 'A4' | 'Letter' = 'A4', landscape = false): Observable<Blob> {
    return this.http.post('/api/export/pdf', { html, fileName, pageSize, landscape }, { responseType: 'blob' });
  }

  docx(html: string, fileName: string, pageSize: 'A4' | 'Letter' = 'A4'): Observable<Blob> {
    return this.http.post('/api/export/docx', { html, fileName, pageSize }, { responseType: 'blob' });
  }

  /** Browser print dialog fallback (also produces a text based PDF via "Save as PDF"). */
  print(html: string): void {
    html = this.stampHtml(html);
    // Android app: the system print service ("Save as PDF") renders the same HTML.
    if (nativeHooks.printHtml) {
      nativeHooks.printHtml(html, /<title>([^<]*)<\/title>/.exec(html)?.[1] || 'ResumeStudio');
      return;
    }
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = html;
    frame.onload = () => {
      const win = frame.contentWindow;
      const ready = frame.contentDocument?.fonts?.ready ?? Promise.resolve();
      void ready.then(() =>
        setTimeout(() => {
          win?.focus();
          win?.print();
          setTimeout(() => frame.remove(), 1500);
        }, 250),
      );
    };
    document.body.appendChild(frame);
  }

  /**
   * Builds a standalone HTML page for the rendered resume element. Page margins
   * repeat on every page, the first page starts flush so header bands bleed to
   * the edge, and sidebar colours continue on following pages.
   */
  buildResumeHtml(element: HTMLElement, design: DesignSettings, title: string): string {
    const margin = design.margin;
    const fonts = [design.headingFont, design.bodyFont, ...(design.layout === 'tech' ? ['JetBrains Mono'] : [])];
    const twoColumn = TWO_COLUMN_LAYOUTS.includes(design.layout);
    const direction = design.layout === 'sidebar-right' ? 'left' : 'right';
    const pageBackground = twoColumn
      ? `linear-gradient(to ${direction}, ${design.sidebarColor} 0 ${design.sidebarWidth}%, ${design.backgroundColor} ${design.sidebarWidth}% 100%)`
      : design.backgroundColor;

    const css = `${RESUME_CSS}
@page { size: ${design.pageSize === 'Letter' ? 'letter' : 'A4'}; margin: ${margin}mm 0 ${margin}mm 0; }
@page :first { margin-top: 0; }
html { background: ${pageBackground}; }
body { margin: 0; }
.rz { width: 100% !important; min-height: 0 !important; box-shadow: none !important; }
.rz:not(.rz-two) { padding-bottom: 0 !important; }
.rz-two .rz-aside, .rz-two .rz-main { padding-bottom: 0 !important; }
.rz .rz-ph { display: none !important; }`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${googleFontsUrl(fonts)}">
<style>${css}</style>
</head>
<body>${element.outerHTML}</body>
</html>`;
  }

  /** Wraps rich-text HTML (from the document editor) into a printable page. */
  buildDocumentHtml(bodyHtml: string, title: string, fonts: string[] = []): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${googleFontsUrl(['Inter', 'Lora', 'Merriweather', 'Roboto', 'Playfair Display', ...fonts])}">
<style>
@page { size: A4; margin: 20mm; }
body { margin: 0; font-family: Inter, Arial, sans-serif; font-size: 11pt; line-height: 1.55; color: #1f2937; }
h1 { font-size: 22pt; margin: 0 0 10pt; } h2 { font-size: 16pt; margin: 14pt 0 8pt; } h3 { font-size: 13pt; margin: 12pt 0 6pt; }
p { margin: 0 0 8pt; } ul, ol { margin: 0 0 8pt; padding-left: 22pt; } img { max-width: 100%; }
blockquote { margin: 0 0 8pt; padding-left: 12pt; border-left: 3px solid #cbd5e1; color: #475569; }
pre { background: #f1f5f9; padding: 8pt; border-radius: 4pt; white-space: pre-wrap; }
table { border-collapse: collapse; } td, th { border: 1px solid #cbd5e1; padding: 4pt 6pt; }
a { color: #2563eb; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
  }
}
