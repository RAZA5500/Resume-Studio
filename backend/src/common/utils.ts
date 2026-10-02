import { randomUUID } from 'node:crypto';

/** Short random id used for resume items (experience rows, skills, ...). */
export const uid = (): string => randomUUID().replace(/-/g, '').slice(0, 12);

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Parses JSON returned by an LLM. Structured outputs normally give clean JSON,
 * but we still tolerate code fences or leading prose as a safety net.
 */
export function parseJsonLoose<T>(raw: string): T {
  const text = raw.trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    // fall through to the lenient strategies below
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]) as T;
    } catch {
      // keep trying
    }
  }
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');

  const candidates: { start: number; end: number }[] = [];
  if (objStart >= 0 && objEnd > objStart) candidates.push({ start: objStart, end: objEnd });
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push({ start: arrStart, end: arrEnd });
  candidates.sort((a, b) => a.start - b.start);

  for (const c of candidates) {
    try {
      return JSON.parse(text.slice(c.start, c.end + 1)) as T;
    } catch {
      // keep trying candidates
    }
  }
  throw new Error('Could not parse JSON from AI response');
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  bull: '•',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Very small HTML → text converter that keeps paragraph and list structure. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|ul|ol|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Converts plain text into simple semantic HTML paragraphs / lists. */
export function textToHtml(text: string): string {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';
      const bulletRe = /^[•\-*▪◦●○■□➢►✓·–—]\s+/;
      if (lines.every((l) => bulletRe.test(l))) {
        return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(bulletRe, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
    })
    .join('\n');
}
