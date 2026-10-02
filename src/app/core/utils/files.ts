import { nativeHooks } from '../native/platform';

export function downloadBlob(blob: Blob, fileName: string): void {
  // Android app: saved to Documents and offered in the share sheet (see native-app.ts).
  if (nativeHooks.saveFile) return nativeHooks.saveFile(blob, fileName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, fileName: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), fileName);
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

let webpEncoding: boolean | null = null;

/** Chrome, Edge, Firefox and Android encode WebP from a canvas; Safari silently returns PNG instead. */
export function canEncodeWebp(): boolean {
  if (webpEncoding === null) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    webpEncoding = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpEncoding;
}

/**
 * Smallest well-supported format for pictures that are only displayed (thumbnails, previews,
 * payment screenshots): WebP, or JPEG where the browser cannot write WebP.
 */
export function compactImageType(): 'image/webp' | 'image/jpeg' {
  return canEncodeWebp() ? 'image/webp' : 'image/jpeg';
}

/**
 * Shrinks a photo or screenshot before upload: longest side at most `max` px, re-encoded as
 * WebP (JPEG on Safari). Keeps the original when re-encoding would not make it smaller.
 */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = compactImageType();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.size >= file.size) return file;
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.${type === 'image/webp' ? 'webp' : 'jpg'}`;
    return new File([blob], name, { type });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscales an image file to fit in `max` px (square crop optional) and returns a JPEG data URL.
 * Stays JPEG on purpose: resume photos also go into the Word export, and Word before Microsoft 365
 * cannot display WebP.
 */
export async function resizeImage(file: Blob, max = 480, square = false, quality = 0.88): Promise<string> {
  const img = await loadImage(await readAsDataUrl(file));
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function timeAgo(date: string | Date): string {
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(date).toLocaleDateString();
}

export function safeFileName(name: string, fallback = 'document'): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80);
  return base || fallback;
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
