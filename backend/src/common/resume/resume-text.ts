import {
  DEFAULT_SECTION_TITLES,
  type DesignSettings,
  type ResumeContent,
} from '../types/resume.types.js';
import { escapeHtml } from '../utils.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatDate(value: string, format: DesignSettings['dateFormat'] = 'MMM YYYY'): string {
  const match = /^(\d{4})-(\d{1,2})/.exec(value?.trim() ?? '');
  if (!match) return value?.trim() ?? '';
  const year = match[1];
  const monthIndex = Math.min(12, Math.max(1, Number(match[2]))) - 1;
  switch (format) {
    case 'MMMM YYYY':
      return `${MONTHS_LONG[monthIndex]} ${year}`;
    case 'MM/YYYY':
      return `${String(monthIndex + 1).padStart(2, '0')}/${year}`;
    case 'YYYY':
      return year;
    default:
      return `${MONTHS_SHORT[monthIndex]} ${year}`;
  }
}

export function dateRange(
  start: string,
  end: string,
  current: boolean,
  format: DesignSettings['dateFormat'] = 'MMM YYYY',
): string {
  const from = formatDate(start, format);
  const to = current ? 'Present' : formatDate(end, format);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

const BULLET_PREFIX = /^\s*[•\-*▪◦●○■□➢►✓·–—]\s*/;

export function bulletLines(description: string): string[] {
  return (description ?? '')
    .split('\n')
    .map((line) => line.replace(BULLET_PREFIX, '').trim())
    .filter(Boolean);
}

export function sectionTitle(content: ResumeContent, key: string): string {
  if (content.sectionTitles[key]) return content.sectionTitles[key];
  if (key.startsWith('custom:')) {
    return content.customSections.find((s) => `custom:${s.id}` === key)?.title ?? 'Section';
  }
  return DEFAULT_SECTION_TITLES[key] ?? key;
}

export function visibleSections(content: ResumeContent): string[] {
  return content.sectionOrder.filter((key) => !content.hiddenSections.includes(key));
}

function contactParts(content: ResumeContent): string[] {
  const p = content.personal;
  return [p.email, p.phone, p.location, p.linkedin, p.website, p.github].filter((v) => v?.trim());
}

/** Plain text rendition — used for ATS scoring and .txt export. */
export function resumeToPlainText(content: ResumeContent): string {
  const out: string[] = [];
  const p = content.personal;
  if (p.fullName) out.push(p.fullName);
  if (p.jobTitle) out.push(p.jobTitle);
  const contact = contactParts(content);
  if (contact.length) out.push(contact.join(' | '));

  for (const key of visibleSections(content)) {
    const lines = sectionPlainText(content, key);
    if (!lines.length) continue;
    out.push('', sectionTitle(content, key).toUpperCase(), ...lines);
  }
  return out.join('\n').trim();
}

function sectionPlainText(content: ResumeContent, key: string): string[] {
  const lines: string[] = [];
  switch (key) {
    case 'summary':
      if (content.summary.trim()) lines.push(content.summary.trim());
      break;
    case 'experience':
      for (const e of content.experience) {
        lines.push([e.jobTitle, e.company].filter(Boolean).join(' — '));
        const meta = [e.location, dateRange(e.startDate, e.endDate, e.current)].filter(Boolean).join(' | ');
        if (meta) lines.push(meta);
        lines.push(...bulletLines(e.description).map((b) => `• ${b}`));
        lines.push('');
      }
      break;
    case 'education':
      for (const e of content.education) {
        lines.push([e.degree, e.institution].filter(Boolean).join(' — '));
        const meta = [e.location, dateRange(e.startDate, e.endDate, e.current), e.gpa ? `GPA: ${e.gpa}` : '']
          .filter(Boolean)
          .join(' | ');
        if (meta) lines.push(meta);
        lines.push(...bulletLines(e.description).map((b) => `• ${b}`));
        lines.push('');
      }
      break;
    case 'skills':
      if (content.skills.length) lines.push(content.skills.map((s) => s.name).join(', '));
      break;
    case 'projects':
      for (const pr of content.projects) {
        lines.push([pr.name, pr.role].filter(Boolean).join(' — '));
        const meta = [pr.link, dateRange(pr.startDate, pr.endDate, false)].filter(Boolean).join(' | ');
        if (meta) lines.push(meta);
        lines.push(...bulletLines(pr.description).map((b) => `• ${b}`));
        lines.push('');
      }
      break;
    case 'certifications':
      for (const c of content.certifications) {
        lines.push(`• ${[c.name, c.issuer, formatDate(c.date)].filter(Boolean).join(' — ')}`);
      }
      break;
    case 'languages':
      if (content.languages.length) {
        lines.push(content.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(', '));
      }
      break;
    case 'awards':
      for (const a of content.awards) {
        lines.push(`• ${[a.title, a.issuer, formatDate(a.date)].filter(Boolean).join(' — ')}`);
        if (a.description) lines.push(`  ${a.description}`);
      }
      break;
    case 'interests':
      if (content.interests.length) lines.push(content.interests.map((i) => i.name).join(', '));
      break;
    default: {
      const section = content.customSections.find((s) => `custom:${s.id}` === key);
      for (const item of section?.items ?? []) {
        lines.push([item.title, item.subtitle, item.date].filter(Boolean).join(' — '));
        lines.push(...bulletLines(item.description).map((b) => `• ${b}`));
      }
    }
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/**
 * Clean single-column semantic HTML designed for DOCX conversion — Word files
 * built from this are maximally ATS friendly regardless of the visual template.
 */
export function resumeToDocxHtml(content: ResumeContent, design?: Partial<DesignSettings>): string {
  const color = design?.primaryColor ?? '#1f2937';
  const font = design?.bodyFont ?? 'Calibri';
  const fmt = design?.dateFormat ?? 'MMM YYYY';
  const p = content.personal;
  const e = escapeHtml;
  const parts: string[] = [];

  parts.push(`<h1 style="color:${color};font-size:22pt;margin:0">${e(p.fullName || 'Your Name')}</h1>`);
  if (p.jobTitle) parts.push(`<p style="font-size:13pt;margin:0"><strong>${e(p.jobTitle)}</strong></p>`);
  const contact = contactParts(content);
  if (contact.length) parts.push(`<p style="font-size:10pt;color:#555555">${contact.map(e).join(' | ')}</p>`);

  const heading = (title: string) =>
    `<h2 style="color:${color};font-size:13pt;border-bottom:1px solid ${color};margin-top:14pt">${e(title.toUpperCase())}</h2>`;
  const list = (items: string[]) => (items.length ? `<ul>${items.map((b) => `<li>${e(b)}</li>`).join('')}</ul>` : '');
  const entry = (title: string, meta: string) =>
    `<p style="margin:6pt 0 0 0"><strong>${e(title)}</strong></p>${meta ? `<p style="margin:0;color:#555555"><em>${e(meta)}</em></p>` : ''}`;

  for (const key of visibleSections(content)) {
    const title = sectionTitle(content, key);
    switch (key) {
      case 'summary':
        if (content.summary.trim()) parts.push(heading(title), `<p>${e(content.summary.trim())}</p>`);
        break;
      case 'experience':
        if (!content.experience.length) break;
        parts.push(heading(title));
        for (const x of content.experience) {
          parts.push(
            entry(
              [x.jobTitle, x.company].filter(Boolean).join(' — '),
              [x.location, dateRange(x.startDate, x.endDate, x.current, fmt)].filter(Boolean).join(' | '),
            ),
            list(bulletLines(x.description)),
          );
        }
        break;
      case 'education':
        if (!content.education.length) break;
        parts.push(heading(title));
        for (const x of content.education) {
          parts.push(
            entry(
              [x.degree, x.institution].filter(Boolean).join(' — '),
              [x.location, dateRange(x.startDate, x.endDate, x.current, fmt), x.gpa ? `GPA: ${x.gpa}` : '']
                .filter(Boolean)
                .join(' | '),
            ),
            list(bulletLines(x.description)),
          );
        }
        break;
      case 'skills':
        if (content.skills.length) parts.push(heading(title), `<p>${e(content.skills.map((s) => s.name).join(' • '))}</p>`);
        break;
      case 'projects':
        if (!content.projects.length) break;
        parts.push(heading(title));
        for (const x of content.projects) {
          parts.push(
            entry(
              [x.name, x.role].filter(Boolean).join(' — '),
              [x.link, dateRange(x.startDate, x.endDate, false, fmt)].filter(Boolean).join(' | '),
            ),
            list(bulletLines(x.description)),
          );
        }
        break;
      case 'certifications':
        if (content.certifications.length) {
          parts.push(
            heading(title),
            list(content.certifications.map((c) => [c.name, c.issuer, formatDate(c.date, fmt)].filter(Boolean).join(' — '))),
          );
        }
        break;
      case 'languages':
        if (content.languages.length) {
          parts.push(
            heading(title),
            `<p>${e(content.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(' • '))}</p>`,
          );
        }
        break;
      case 'awards':
        if (content.awards.length) {
          parts.push(
            heading(title),
            list(
              content.awards.map((a) =>
                [a.title, a.issuer, formatDate(a.date, fmt), a.description].filter(Boolean).join(' — '),
              ),
            ),
          );
        }
        break;
      case 'interests':
        if (content.interests.length) parts.push(heading(title), `<p>${e(content.interests.map((i) => i.name).join(' • '))}</p>`);
        break;
      default: {
        const section = content.customSections.find((s) => `custom:${s.id}` === key);
        if (!section?.items.length) break;
        parts.push(heading(title));
        for (const item of section.items) {
          parts.push(entry([item.title, item.subtitle].filter(Boolean).join(' — '), item.date), list(bulletLines(item.description)));
        }
      }
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:${e(font)};font-size:10.5pt">${parts.join('\n')}</body></html>`;
}
