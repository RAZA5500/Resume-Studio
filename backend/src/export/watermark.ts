/** Free plan exports carry this mark; Lifetime members get clean files. */
export const WATERMARK_TEXT = 'ResumeStudio AI';
export const WATERMARK_FOOTER = 'Made with ResumeStudio AI (Free plan) — upgrade to Lifetime to remove this watermark';

/**
 * position: fixed elements repeat on every printed page in Chromium, so one
 * overlay stamps the whole PDF: a faint diagonal mark plus a small footer line.
 */
const WATERMARK_CSS = `
.rs-wm { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; overflow: hidden;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rs-wm-mark { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-35deg);
  font: 700 64pt/1 Arial, Helvetica, sans-serif; letter-spacing: 2pt; white-space: nowrap;
  color: rgba(100, 116, 139, 0.13); }
.rs-wm-foot { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center;
  font: 600 7.5pt/1.2 Arial, Helvetica, sans-serif; color: rgba(71, 85, 105, 0.75); }
`;

export function watermarkHtml(html: string): string {
  const overlay = `<style>${WATERMARK_CSS}</style><div class="rs-wm" aria-hidden="true"><div class="rs-wm-mark">${WATERMARK_TEXT}</div><div class="rs-wm-foot">${WATERMARK_FOOTER}</div></div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${overlay}</body>`) : `${html}${overlay}`;
}

/** Word footer shown on every page of a free plan .docx. */
export const WATERMARK_DOCX_FOOTER = `<p style="text-align:center;font-size:8pt;color:#64748b;">${WATERMARK_FOOTER}</p>`;

export function watermarkText(text: string): string {
  return `${text.replace(/\s+$/, '')}\n\n---\n${WATERMARK_FOOTER}\n`;
}
