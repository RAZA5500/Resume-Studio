export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type FileKind = 'pdf' | 'image' | 'docx' | 'doc' | 'text' | 'rtf' | 'html' | 'unknown';

const EXTENSION_KINDS: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  bmp: 'image',
  gif: 'image',
  tif: 'image',
  tiff: 'image',
  docx: 'docx',
  doc: 'doc',
  txt: 'text',
  md: 'text',
  markdown: 'text',
  csv: 'text',
  json: 'text',
  rtf: 'rtf',
  html: 'html',
  htm: 'html',
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_KINDS);

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : '';
}

export function detectFileKind(name: string, mime?: string): FileKind {
  const byExtension = EXTENSION_KINDS[extensionOf(name)];
  if (byExtension) return byExtension;
  if (!mime) return 'unknown';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime === 'application/msword') return 'doc';
  if (mime.startsWith('text/html')) return 'html';
  if (mime.includes('rtf')) return 'rtf';
  if (mime.startsWith('text/')) return 'text';
  return 'unknown';
}

/** Multer decodes multipart file names as latin1; recover UTF-8 names (e.g. "résumé.pdf"). */
export function decodeOriginalName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

export function contentDisposition(fileName: string, type: 'inline' | 'attachment' = 'attachment'): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Produces a file-system and header safe base name (without extension). */
export function safeFileBase(name: string, fallback = 'document'): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N} _.-]+/gu, '')
    .trim()
    .slice(0, 80);
  return base || fallback;
}

export const MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
} as const;
