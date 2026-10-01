/**
 * Rule-based "offline AI". Used automatically when no ANTHROPIC_API_KEY is
 * configured so every feature of the app still produces useful output.
 */
import { ACTION_VERBS, GENERIC_SKILLS, ROLE_SKILLS, SECTION_SYNONYMS } from '../ats/ats-dictionaries.js';
import { containsKeyword, detectSkills, extractJobKeywords } from '../ats/ats-scorer.js';
import { createEmptyContent, normalizeContent } from '../common/resume/resume-defaults.js';
import { bulletLines } from '../common/resume/resume-text.js';
import type { ResumeContent } from '../common/types/resume.types.js';
import { uid } from '../common/utils.js';
import type { CoverLetter, SkillSuggestions } from './ai.types.js';

export type ImproveMode =
  | 'bullets'
  | 'summary'
  | 'grammar'
  | 'shorten'
  | 'expand'
  | 'professional'
  | 'quantify'
  | 'simplify'
  | 'custom';

const ROLE_VOCAB = [
  { match: /software|developer|engineer|programmer|devops|web|stack/i, area: 'software development', deliverables: 'features', process: 'release', tools: 'automation' },
  { match: /data|analyst|analytics|scientist|\bbi\b/i, area: 'data analysis', deliverables: 'dashboards', process: 'reporting', tools: 'analytics' },
  { match: /design|ux|\bui\b|creative/i, area: 'design', deliverables: 'design projects', process: 'design review', tools: 'design system' },
  { match: /market|seo|content|brand|social/i, area: 'marketing', deliverables: 'campaigns', process: 'content production', tools: 'marketing automation' },
  { match: /sales|business development|account exec/i, area: 'sales', deliverables: 'deals', process: 'sales pipeline', tools: 'CRM' },
  { match: /financ|accountant|accounting|audit|tax/i, area: 'financial', deliverables: 'financial reports', process: 'month-end close', tools: 'accounting' },
  { match: /\bhr\b|human resources|recruit|talent/i, area: 'recruitment', deliverables: 'hiring campaigns', process: 'onboarding', tools: 'HRIS' },
  { match: /teach|educat|tutor|lecturer/i, area: 'curriculum', deliverables: 'lesson plans', process: 'assessment', tools: 'e-learning' },
  { match: /nurse|medical|health|clinic/i, area: 'patient care', deliverables: 'care plans', process: 'patient intake', tools: 'EMR' },
  { match: /project|program|product|manager|operations/i, area: 'project delivery', deliverables: 'projects', process: 'operational', tools: 'project management' },
];
const DEFAULT_VOCAB = { area: 'operational', deliverables: 'projects', process: 'workflow', tools: 'digital' };

const BULLET_TEMPLATES = [
  'Led {area} initiatives that improved team efficiency by [X%] within [N] months',
  'Delivered [N]+ {deliverables} on time and within budget by partnering with cross-functional stakeholders',
  'Streamlined {process} workflows, reducing turnaround time by [X%] and saving [N] hours per month',
  'Collaborated with a [N]-person team to launch {deliverables} that increased customer satisfaction by [X%]',
  'Identified and resolved recurring {area} issues, cutting error rates by [X%]',
  'Mentored [N] junior colleagues and documented best practices adopted across the department',
  'Analyzed {area} data to uncover insights that generated [$X] in cost savings',
  'Implemented new {tools} processes that boosted productivity by [X%]',
  'Presented {area} results to senior leadership, securing approval for [N] new initiatives',
  'Built strong relationships with [N]+ stakeholders to align {deliverables} with business goals',
];

const IRREGULAR_PAST: Record<string, string> = {
  leading: 'Led',
  building: 'Built',
  writing: 'Wrote',
  running: 'Ran',
  making: 'Made',
  driving: 'Drove',
  teaching: 'Taught',
  overseeing: 'Oversaw',
  selling: 'Sold',
  growing: 'Grew',
  setting: 'Set',
  cutting: 'Cut',
  winning: 'Won',
  bringing: 'Brought',
  planning: 'Planned',
};

/** Weak openings and the verb used when no gerund follows ("worked on fixing bugs" → "Fixed bugs"). */
const WEAK_OPENINGS: Array<[RegExp, string]> = [
  [/^(?:was\s+)?responsible for\s+/i, 'Managed'],
  [/^duties include[d]?\s+/i, 'Delivered'],
  [/^worked on\s+/i, 'Developed'],
  [/^helped (?:to\s+)?/i, 'Supported'],
  [/^assisted (?:with|in)\s+/i, 'Supported'],
  [/^in charge of\s+/i, 'Directed'],
  [/^tasked with\s+/i, 'Executed'],
  [/^(?:was\s+)?involved in\s+/i, 'Contributed to'],
  [/^participated in\s+/i, 'Contributed to'],
];

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const unique = (items: string[]) => [...new Map(items.map((i) => [i.toLowerCase(), i])).values()];

function vocabFor(title: string) {
  return ROLE_VOCAB.find((v) => v.match.test(title)) ?? DEFAULT_VOCAB;
}

function roleSkills(title: string) {
  return ROLE_SKILLS.find((r) => r.match.test(title)) ?? GENERIC_SKILLS;
}

function hashOf(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function toPastTense(word: string): string | null {
  const w = word.toLowerCase();
  if (IRREGULAR_PAST[w]) return IRREGULAR_PAST[w];
  if (!w.endsWith('ing') || w.length < 6) return null;
  const stem = w.slice(0, -3);
  const candidates = [`${stem}ed`, `${stem}d`, `${stem.replace(/(.)\1$/, '$1')}ed`, `${stem}ed`.replace(/yed$/, 'ied')];
  const match = candidates.find((c) => ACTION_VERBS.has(c));
  return match ? capitalize(match) : null;
}

export function improveLine(line: string): string {
  let text = line
    .replace(/^\s*[•\-*▪◦●○■□➢►✓·–—]\s*/, '')
    .trim()
    .replace(/\.+$/, '')
    .replace(/^(?:i|we)\s+/i, '');
  const opening = WEAK_OPENINGS.find(([pattern]) => pattern.test(text));
  if (opening) {
    const rest = text.replace(opening[0], '');
    const [next, ...others] = rest.split(' ');
    const past = next ? toPastTense(next) : null;
    text = past ? [past, ...others].join(' ') : `${opening[1]} ${rest}`;
  } else {
    const [first, ...others] = text.split(' ');
    const past = first ? toPastTense(first) : null;
    if (past) text = [past, ...others].join(' ');
  }
  return capitalize(text.replace(/\s+/g, ' '));
}

function basicGrammar(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,;:!?])/g, '$1')
    .replace(/([,;!?])(?=[A-Za-z])/g, '$1 ')
    .replace(/\bi\b/g, 'I')
    .replace(/(^|[.!?]\s+|\n)([a-z])/g, (_, prefix: string, char: string) => prefix + char.toUpperCase())
    .trim();
}

function shorten(text: string): string {
  return text
    .replace(/\bin order to\b/gi, 'to')
    .replace(/\b(very|really|successfully|various|basically|actually|extremely|a number of)\s+/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function offlineImprove(text: string, mode: ImproveMode): { text: string; alternatives: string[] } {
  const lines = text.split('\n').filter((l) => l.trim());
  switch (mode) {
    case 'grammar':
      return { text: basicGrammar(text), alternatives: [] };
    case 'shorten':
      return { text: lines.map((l) => shorten(l)).join('\n'), alternatives: [] };
    case 'simplify':
      return { text: basicGrammar(shorten(text)), alternatives: [] };
    case 'quantify':
      return {
        text: lines
          .map((l) => improveLine(l))
          .map((l) => (/\d/.test(l) ? l : `${l}, improving [key metric] by [X%]`))
          .join('\n'),
        alternatives: [],
      };
    case 'expand':
      return {
        text: lines
          .map((l) => improveLine(l))
          .map((l) => `${l}, collaborating with cross-functional teams to deliver measurable results for [stakeholders]`)
          .join('\n'),
        alternatives: [],
      };
    case 'summary':
    case 'professional':
      return {
        text: basicGrammar(
          text
            .replace(/\b(I am|I'm)\s+/gi, '')
            .replace(/\b(I have|I've)\s+/gi, 'Brings ')
            .replace(/\bmy\s+/gi, ''),
        ),
        alternatives: [],
      };
    default: {
      const improved = lines.map((l) => improveLine(l));
      const quantified = improved.map((l) => (/\d/.test(l) ? l : `${l}, resulting in [X%] improvement`));
      return { text: improved.join('\n'), alternatives: [quantified.join('\n')] };
    }
  }
}

export function offlineBullets(jobTitle: string, count = 5, existing: string[] = []): string[] {
  const vocab = vocabFor(jobTitle);
  const start = hashOf(jobTitle + existing.length) % BULLET_TEMPLATES.length;
  const bullets: string[] = [];
  for (let i = 0; bullets.length < count && i < BULLET_TEMPLATES.length; i++) {
    const template = BULLET_TEMPLATES[(start + i) % BULLET_TEMPLATES.length];
    const bullet = template
      .replace('{area}', vocab.area)
      .replace('{deliverables}', vocab.deliverables)
      .replace('{process}', vocab.process)
      .replace('{tools}', vocab.tools);
    if (!existing.includes(bullet)) bullets.push(bullet);
  }
  return bullets;
}

export function offlineSkills(jobTitle: string, existing: string[] = [], jobDescription = ''): SkillSuggestions {
  const have = new Set(existing.map((s) => s.toLowerCase()));
  const fromJob = jobDescription ? detectSkills(jobDescription) : [];
  const role = roleSkills(`${jobTitle} ${jobDescription.slice(0, 300)}`);
  const hard = unique([...fromJob, ...role.hard]).filter((s) => !have.has(s.toLowerCase()));
  const soft = unique([...role.soft, ...GENERIC_SKILLS.soft]).filter((s) => !have.has(s.toLowerCase()));
  return { hardSkills: hard.slice(0, 12), softSkills: soft.slice(0, 6), tools: fromJob.filter((s) => !have.has(s.toLowerCase())).slice(0, 8) };
}

function parseYearMonth(value: string): Date | null {
  const match = /^(\d{4})(?:-(\d{1,2}))?/.exec(value ?? '');
  return match ? new Date(Number(match[1]), match[2] ? Number(match[2]) - 1 : 0, 1) : null;
}

export function totalYears(content: ResumeContent): number {
  const now = new Date();
  let months = 0;
  for (const e of content.experience) {
    const start = parseYearMonth(e.startDate);
    if (!start) continue;
    const end = e.current ? now : (parseYearMonth(e.endDate) ?? now);
    months += Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
  }
  return Math.floor(months / 12);
}

export function offlineSummaries(content: ResumeContent, targetRole?: string): string[] {
  const role = targetRole || content.personal.jobTitle || content.experience[0]?.jobTitle || 'Professional';
  const years = totalYears(content);
  const skills = content.skills.slice(0, 5).map((s) => s.name);
  const skillText = skills.length > 1 ? `${skills.slice(0, -1).join(', ')} and ${skills[skills.length - 1]}` : skills[0];
  const achievement = content.experience.flatMap((e) => bulletLines(e.description)).find((b) => /\d/.test(b));
  const experienceText = years ? `${years}+ years of experience` : 'hands-on experience';
  const companies = content.experience.map((e) => e.company).filter(Boolean).slice(0, 2);

  const highlight = achievement
    ? `${capitalize(achievement.replace(/\.+$/, ''))}.`
    : 'Consistently delivers high-quality work on time.';

  return [
    `${capitalize(role)} with ${experienceText}${skillText ? ` in ${skillText}` : ''}. ${highlight} Combines strong problem-solving with clear communication to drive measurable business results.`,
    `Accomplished ${role} bringing ${experienceText}${
      companies.length ? ` at organizations such as ${companies.join(' and ')}` : ''
    }. Skilled at turning complex requirements into practical solutions${
      skillText ? ` using ${skillText}` : ''
    }. Recognized for ownership, collaboration and continuous improvement.`,
    `${capitalize(role)} specializing in ${skillText || 'cross-functional delivery'}. Known for improving processes, mentoring colleagues and delivering outcomes that matter to customers and stakeholders. Ready to bring ${experienceText} to a high-impact ${role} role.`,
  ];
}

export function offlineTailor(content: ResumeContent, jobDescription: string) {
  const keywords = extractJobKeywords(jobDescription, 25);
  const resumeText = JSON.stringify(content);
  const matched = keywords.filter((k) => containsKeyword(resumeText, k));
  const missing = keywords.filter((k) => !matched.includes(k));
  const jobSkills = detectSkills(jobDescription);
  const updated: ResumeContent = structuredClone(content);

  const skillNames = updated.skills.map((s) => s.name.toLowerCase());
  const evidenced = jobSkills.filter((s) => !skillNames.includes(s.toLowerCase()) && containsKeyword(resumeText, s));
  updated.skills = [
    ...updated.skills.filter((s) => jobSkills.some((j) => j.toLowerCase() === s.name.toLowerCase())),
    ...evidenced.map((name) => ({ id: uid(), name, level: 0 })),
    ...updated.skills.filter((s) => !jobSkills.some((j) => j.toLowerCase() === s.name.toLowerCase())),
  ];

  const focus = matched.slice(0, 4);
  if (focus.length && updated.summary && !focus.every((k) => containsKeyword(updated.summary, k))) {
    updated.summary = `${updated.summary.trim().replace(/\.?$/, '.')} Experienced with ${focus.join(', ')}.`;
  }
  updated.experience = updated.experience.map((e) => ({
    ...e,
    description: bulletLines(e.description).map(improveLine).join('\n'),
  }));

  const changes = [
    'Re-ordered skills so the ones requested in the job description appear first.',
    ...(evidenced.length ? [`Added skills found elsewhere in your resume: ${evidenced.join(', ')}.`] : []),
    ...(focus.length ? ['Strengthened the summary with matching job keywords.'] : []),
    'Tightened experience bullets to start with strong action verbs.',
    ...(missing.length
      ? [`Consider adding these job keywords if they apply to you: ${missing.slice(0, 10).join(', ')}.`]
      : []),
  ];
  return { content: normalizeContent(updated), changes, addedKeywords: evidenced };
}

export function offlineCoverLetter(
  content: ResumeContent,
  jobDescription: string,
  company?: string,
  hiringManager?: string,
): CoverLetter {
  const name = content.personal.fullName || '[Your Name]';
  const titleLine = /(?:job title|position|role)\s*[:-]\s*([^\n.]{3,60})/i.exec(jobDescription)?.[1];
  const firstLine = jobDescription.trim().split('\n')[0];
  const role = (titleLine ?? (firstLine.split(' ').length <= 8 ? firstLine : '')) || content.personal.jobTitle || 'this';
  const target = company || 'your company';
  const years = totalYears(content);
  const skills = detectSkills(jobDescription).filter((s) => containsKeyword(JSON.stringify(content), s)).slice(0, 4);
  const achievements = content.experience.flatMap((e) => bulletLines(e.description)).slice(0, 2);
  const recent = content.experience[0];

  const paragraphs = [
    `Dear ${hiringManager || 'Hiring Manager'},`,
    `I am excited to apply for the ${role.trim()} position at ${target}. With ${
      years ? `${years}+ years of experience` : 'solid experience'
    }${recent?.jobTitle ? ` as a ${recent.jobTitle}` : ''}${
      skills.length ? ` and expertise in ${skills.join(', ')}` : ''
    }, I am confident I can make an immediate contribution to your team.`,
    achievements.length
      ? `In my recent role${recent?.company ? ` at ${recent.company}` : ''}, I ${lowerFirst(achievements[0])}${
          achievements[1] ? `. I also ${lowerFirst(achievements[1])}` : ''
        }. These experiences taught me how to deliver results in fast-paced environments and collaborate closely with stakeholders.`
      : 'Throughout my career I have focused on delivering reliable results, learning quickly and collaborating closely with stakeholders.',
    `What excites me most about ${target} is the opportunity to apply these strengths to meaningful challenges. I would welcome the chance to discuss how my background can help your team achieve its goals.`,
    'Thank you for your time and consideration.',
    `Sincerely,\n${name}`,
  ];
  return { subject: `Application for ${role.trim()} – ${name}`, body: paragraphs.join('\n\n') };
}

// ---------------------------------------------------------------------------
// Resume text → structured content (heuristic parser)
// ---------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_TOKEN = String.raw`(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}-\d{2}|\d{4})`;
const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN}|present|current|now|till date|ongoing)`, 'i');
const BULLET_RE = /^[•\-*▪◦●○■□➢►✓·–—➤→]\s*/;

function toIsoDate(token: string): string {
  const t = token.trim().toLowerCase();
  const monthYear = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t);
  if (monthYear) {
    const index = MONTHS.indexOf(monthYear[1]);
    return index >= 0 ? `${monthYear[2]}-${String(index + 1).padStart(2, '0')}` : monthYear[2];
  }
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, '0')}`;
  if (/^\d{4}(-\d{2})?$/.test(t)) return t;
  return '';
}

function sectionKeyForLine(line: string): string | null {
  const head = line.includes(':') ? line.split(':')[0] : line;
  const normalized = head
    .toLowerCase()
    .replace(/[^a-z& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.split(' ').length > 4) return null;
  for (const [key, synonyms] of Object.entries(SECTION_SYNONYMS)) {
    if (synonyms.includes(normalized)) return key;
  }
  return null;
}

interface ParsedEntry {
  header: string[];
  start: string;
  end: string;
  current: boolean;
  bullets: string[];
}

function parseEntries(lines: string[]): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  let current: ParsedEntry | null = null;
  let pending: string[] = [];
  for (const line of lines) {
    const isBullet = BULLET_RE.test(line) || line.split(/\s+/).length > 14;
    const range = DATE_RANGE_RE.exec(line);
    if (range && !BULLET_RE.test(line)) {
      const rest = line
        .replace(DATE_RANGE_RE, '')
        .replace(/[|,–—-]\s*$/, '')
        .replace(/^\s*[|,–—-]/, '')
        .trim();
      const ended = /present|current|now|till|ongoing/i.test(range[2]);
      current = {
        header: [...pending, ...(rest ? [rest] : [])],
        start: toIsoDate(range[1]),
        end: ended ? '' : toIsoDate(range[2]),
        current: ended,
        bullets: [],
      };
      entries.push(current);
      pending = [];
    } else if (isBullet) {
      if (!current) {
        current = { header: pending, start: '', end: '', current: false, bullets: [] };
        entries.push(current);
        pending = [];
      }
      current.bullets.push(line.replace(BULLET_RE, '').trim());
    } else if (current && current.bullets.length === 0 && current.header.length < 3) {
      current.header.push(line);
    } else {
      pending.push(line);
    }
  }
  if (pending.length) {
    if (current) current.bullets.push(...pending);
    else entries.push({ header: pending, start: '', end: '', current: false, bullets: [] });
  }
  return entries;
}

function splitHeader(header: string[]): [string, string, string] {
  if (header.length >= 2) return [header[0], header[1], header[2] ?? ''];
  const single = header[0] ?? '';
  const parts = single.split(/\s+(?:at|@)\s+|\s+[|–—-]\s+|,\s+/);
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
}

const splitList = (lines: string[]) =>
  lines
    .flatMap((l) => l.split(/[,•|;·]/))
    .map((s) => s.replace(BULLET_RE, '').trim())
    .filter((s) => s.length > 1 && s.length <= 40);

export function offlineParseResume(text: string): ResumeContent {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const buckets: Record<string, string[]> = { header: [] };
  let section = 'header';
  for (const line of lines) {
    const key = sectionKeyForLine(line);
    if (key) {
      section = key;
      buckets[key] ??= [];
      const inline = line.includes(':') ? line.split(':').slice(1).join(':').trim() : '';
      if (inline) buckets[key].push(inline);
      continue;
    }
    (buckets[section] ??= []).push(line);
  }

  const content = createEmptyContent();
  const header = buckets['header'];
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] ?? '';
  const phone = /\+?[\d(][\d\s().-]{7,}\d/.exec(header.join(' '))?.[0]?.trim() ?? '';
  const nameLine = header.find(
    (l) => /^[A-Za-z][A-Za-z.'\s-]{2,50}$/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 5,
  );
  const nameIndex = nameLine ? header.indexOf(nameLine) : -1;
  const titleLine = nameIndex >= 0 ? header[nameIndex + 1] : undefined;

  content.personal = {
    ...content.personal,
    fullName: nameLine ? titleCase(nameLine.toLowerCase()) : '',
    jobTitle: titleLine && titleLine.split(/\s+/).length <= 8 && !/@|\d{3}/.test(titleLine) ? titleLine : '',
    email,
    phone,
    linkedin: /linkedin\.com\/[A-Za-z0-9_/%-]+/i.exec(text)?.[0] ?? '',
    github: /github\.com\/[A-Za-z0-9_-]+/i.exec(text)?.[0] ?? '',
    location:
      header.find((l) => /^[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+$/.test(l) && l.split(/\s+/).length <= 5) ?? '',
  };
  content.summary = (buckets['summary'] ?? []).join(' ');

  content.experience = parseEntries(buckets['experience'] ?? []).map((entry) => {
    const [jobTitle, company, location] = splitHeader(entry.header);
    return {
      id: uid(),
      jobTitle,
      company,
      location,
      startDate: entry.start,
      endDate: entry.end,
      current: entry.current,
      description: entry.bullets.join('\n'),
    };
  });
  content.education = parseEntries(buckets['education'] ?? []).map((entry) => {
    const [degree, institution, location] = splitHeader(entry.header);
    return {
      id: uid(),
      degree,
      institution,
      location,
      startDate: entry.start,
      endDate: entry.end,
      current: entry.current,
      gpa: /gpa[:\s]*([\d.]+\s*\/?\s*[\d.]*)/i.exec(entry.bullets.join(' '))?.[1] ?? '',
      description: entry.bullets.join('\n'),
    };
  });
  content.projects = parseEntries(buckets['projects'] ?? []).map((entry) => {
    const [name, role] = splitHeader(entry.header);
    return { id: uid(), name, role, link: '', startDate: entry.start, endDate: entry.end, description: entry.bullets.join('\n') };
  });
  content.skills = unique(splitList(buckets['skills'] ?? [])).map((name) => ({ id: uid(), name, level: 0 }));
  content.languages = splitList(buckets['languages'] ?? []).map((raw) => {
    const match = /^(.+?)\s*[(\-–:]\s*([^)]+)\)?$/.exec(raw);
    return { id: uid(), name: match?.[1] ?? raw, proficiency: match?.[2] ?? '' };
  });
  content.certifications = (buckets['certifications'] ?? []).map((l) => ({
    id: uid(),
    name: l.replace(BULLET_RE, ''),
    issuer: '',
    date: '',
    link: '',
  }));
  content.awards = (buckets['awards'] ?? []).map((l) => ({
    id: uid(),
    title: l.replace(BULLET_RE, ''),
    issuer: '',
    date: '',
    description: '',
  }));
  content.interests = splitList(buckets['interests'] ?? []).map((name) => ({ id: uid(), name }));
  return normalizeContent(content);
}

export function offlineGenerateResume(prompt: string, targetRole?: string): ResumeContent {
  const content = createEmptyContent();
  const roleFromPrompt =
    /(?:work as|working as|i am|i'm|as)\s+an?\s+([a-z][a-z /&-]{2,40}?)(?=\s+(?:with|at|in|for|and)\b|[,.]|$)/i.exec(prompt)?.[1];
  const role = titleCase((targetRole || roleFromPrompt || 'Professional').trim());
  const years = Number(/(\d+)\+?\s*(?:years|yrs)/i.exec(prompt)?.[1] ?? 0);
  const namePrefix = /(?:my name is|name\s*:)\s*/i.exec(prompt);
  const name = namePrefix
    ? (/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/.exec(prompt.slice(namePrefix.index + namePrefix[0].length))?.[1] ?? '')
    : '';
  const skills = unique([...detectSkills(prompt), ...roleSkills(role).hard.slice(0, 9), ...roleSkills(role).soft.slice(0, 3)]).slice(
    0,
    14,
  );

  content.personal = {
    ...content.personal,
    fullName: name,
    jobTitle: role,
    email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(prompt)?.[0] ?? '',
    phone: /\+?[\d(][\d\s().-]{7,}\d/.exec(prompt)?.[0]?.trim() ?? '',
    linkedin: /linkedin\.com\/[A-Za-z0-9_/%-]+/i.exec(prompt)?.[0] ?? '',
  };
  content.skills = skills.map((s) => ({ id: uid(), name: s, level: 0 }));
  const startYear = new Date().getFullYear() - (years || 2);
  content.experience = [
    {
      id: uid(),
      jobTitle: role,
      company: '[Company Name]',
      location: '[City, Country]',
      startDate: `${startYear}-01`,
      endDate: '',
      current: true,
      description: offlineBullets(role, 5).join('\n'),
    },
  ];
  const degree =
    /\b(?:bachelor(?:'s)?|master(?:'s)?|ph\.?d|doctorate|diploma|associate(?:'s)? degree|bba|bcs|bsc|bs|ba|b\.com|bcom|be|btech|mba|msc|ms|ma|mcom|mtech|mphil)\b[^,.\n]*/i.exec(
      prompt,
    )?.[0];
  if (degree) {
    const [degreeName, institution] = degree.split(/\s+(?:from|at)\s+/i);
    content.education = [
      {
        id: uid(),
        degree: capitalize(degreeName.trim()),
        institution: institution?.trim() || '[University Name]',
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        gpa: '',
        description: '',
      },
    ];
  }
  content.summary = offlineSummaries(content, role)[0];
  return normalizeContent(content);
}
