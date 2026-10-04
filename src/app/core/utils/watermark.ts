/**
 * Free plan exports carry a ResumeStudio watermark; Lifetime members get clean
 * files. Server-made PDFs/DOCX are stamped by the backend — these helpers cover
 * the files the browser builds itself (print, canvas editor, PDF tools).
 */
export const WATERMARK_TEXT = 'ResumeStudio AI';
export const WATERMARK_FOOTER = 'Made with ResumeStudio AI (Free plan) — upgrade to Lifetime to remove this watermark';

const WATERMARK_CSS = `
.rs-wm { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; overflow: hidden;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rs-wm-mark { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-35deg);
  font: 700 64pt/1 Arial, Helvetica, sans-serif; letter-spacing: 2pt; white-space: nowrap;
  color: rgba(100, 116, 139, 0.13); }
.rs-wm-foot { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center;
  font: 600 7.5pt/1.2 Arial, Helvetica, sans-serif; color: rgba(71, 85, 105, 0.75); }
`;

/** Fixed elements repeat on every printed page, so one overlay stamps the whole document. */
export function watermarkHtml(html: string): string {
  const overlay = `<style>${WATERMARK_CSS}</style><div class="rs-wm" aria-hidden="true"><div class="rs-wm-mark">${WATERMARK_TEXT}</div><div class="rs-wm-foot">${WATERMARK_FOOTER}</div></div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${overlay}</body>`) : html + overlay;
}

export function watermarkText(text: string): string {
  return `${text.replace(/\s+$/, '')}\n\n---\n${WATERMARK_FOOTER}\n`;
}

/** Stamps every page of a PDF with the diagonal mark and footer line. */
export async function watermarkPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Standard fonts are WinAnsi only — swap the em dash for a plain hyphen.
  const footer = WATERMARK_FOOTER.replace('—', '-');
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(width, height) / 8;
    const markWidth = bold.widthOfTextAtSize(WATERMARK_TEXT, size);
    const angle = Math.atan2(height, width);
    // Centre the rotated baseline on the page.
    const x = width / 2 - (Math.cos(angle) * markWidth) / 2 + (Math.sin(angle) * size) / 3;
    const y = height / 2 - (Math.sin(angle) * markWidth) / 2 - (Math.cos(angle) * size) / 3;
    page.drawText(WATERMARK_TEXT, { x, y, size, font: bold, color: rgb(0.39, 0.45, 0.55), opacity: 0.13, rotate: degrees((angle * 180) / Math.PI) });
    const footSize = Math.max(6, Math.min(8, width / 80));
    const footWidth = bold.widthOfTextAtSize(footer, footSize);
    page.drawText(footer, { x: (width - footWidth) / 2, y: 10, size: footSize, font: bold, color: rgb(0.28, 0.33, 0.41), opacity: 0.75 });
  }
  return pdf.save();
}

/** Draws the watermark straight onto a canvas (image exports). */
export function watermarkCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const size = Math.min(width, height) / 8;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.atan2(height, width));
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(100, 116, 139, 0.16)';
  ctx.fillText(WATERMARK_TEXT, 0, 0);
  ctx.restore();
  const footSize = Math.max(10, Math.min(width, height) / 70);
  ctx.save();
  ctx.font = `600 ${footSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(71, 85, 105, 0.8)';
  ctx.fillText(WATERMARK_FOOTER, width / 2, height - footSize * 0.8, width * 0.96);
  ctx.restore();
  return canvas;
}

/** Same as watermarkCanvas for a data URL; returns a new data URL of the same type. */
export async function watermarkDataUrl(url: string, type: string, quality = 0.92): Promise<string> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return watermarkCanvas(canvas).toDataURL(type, quality);
}
