import { escapeHtml } from './files';

type PdfJs = typeof import('pdfjs-dist');

let pdfjs: Promise<PdfJs> | null = null;

/** Lazily loads pdf.js (heavy) and points it at the worker copied to /pdfjs by angular.json. */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    return lib;
  });
  return pdfjs;
}

export async function openPdf(bytes: ArrayBuffer | Uint8Array) {
  const lib = await loadPdfJs();
  // pdf.js transfers the buffer to its worker, so always hand it a copy.
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  return lib.getDocument({ data }).promise;
}

/** Renders one page (1-based) to a canvas at the given CSS-pixel scale. */
export async function renderPdfPage(
  doc: Awaited<ReturnType<typeof openPdf>>,
  pageNumber: number,
  scale: number,
  rotation = 0,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), type, quality),
  );
}

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}

/** Parses "1-3, 5, 8-" style ranges into zero-based page indices. */
export function parsePageRanges(input: string, total: number): number[] {
  const pages = new Set<number>();
  for (const part of input.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [startRaw, endRaw] = part.split('-').map((p) => p.trim());
    let start = Math.max(1, Number(startRaw) || 1);
    let end = part.includes('-') ? Math.min(total, Number(endRaw) || total) : start;
    if (start > end) [start, end] = [end, start];
    for (let p = start; p <= end && p <= total; p++) pages.add(p - 1);
  }
  return [...pages].sort((a, b) => a - b);
}

export async function extractPdfPages(file: File, ranges: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const indices = parsePageRanges(ranges, source.getPageCount());
  if (!indices.length) throw new Error('No valid pages in that range.');
  const out = await PDFDocument.create();
  (await out.copyPages(source, indices)).forEach((page) => out.addPage(page));
  return out.save();
}

/** Places each image on its own page (A4 portrait/landscape fitted, 24pt margin). */
export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const bytes = await normalizeImage(file);
    const image = await pdf.embedJpg(bytes);
    const landscape = image.width > image.height;
    const [pageW, pageH] = landscape ? [841.89, 595.28] : [595.28, 841.89];
    const margin = 24;
    const scale = Math.min((pageW - margin * 2) / image.width, (pageH - margin * 2) / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    const page = pdf.addPage([pageW, pageH]);
    page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
  }
  return pdf.save();
}

/** Converts any browser-readable image to JPEG bytes (pdf-lib only embeds JPG/PNG). */
async function normalizeImage(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
}

export function textToHtml(text: string): string {
  return text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
}
