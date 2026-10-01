import {
  ACTION_VERBS,
  BUZZWORDS,
  SECTION_SYNONYMS,
  SKILLS,
  STOPWORDS,
  WEAK_PHRASES,
} from './ats-dictionaries.js';

export type AtsStatus = 'good' | 'warn' | 'bad';
export type AtsSourceKind = 'pdf' | 'image' | 'docx' | 'doc' | 'text' | 'rtf' | 'html' | 'unknown' | 'resume';

export interface AtsCategoryResult {
  key: string;
  label: string;
  score: number;
  max: number;
  status: AtsStatus;
  details: string[];
}

export interface AtsIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  fix: string;
}

export interface AtsKeywordResult {
  source: 'job-description' | 'general';
  matched: string[];
  missing: string[];
  matchRate: number | null;
  detectedSkills: string[];
}

export interface AtsStats {
  wordCount: number;
  bulletCount: number;
  actionVerbCount: number;
  quantifiedCount: number;
  avgBulletWords: number;
  pronounCount: number;
  weakPhrases: string[];
  buzzwords: string[];
  sectionsFound: string[];
  sectionsMissing: string[];
  contact: { email: string | null; phone: string | null; linkedin: string | null; website: string | null; github: string | null };
  pages: number | null;
  readingTimeSec: number;
}

export interface AtsResult {
  score: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs Work';
  summary: string;
  breakdown: AtsCategoryResult[];
  keywords: AtsKeywordResult;
  issues: AtsIssue[];
  stats: AtsStats;
}

export interface AtsInput {
  text: string;
  jobDescription?: string | null;
  sourceKind?: AtsSourceKind;
  extractionMethod?: 'text' | 'ocr';
  pages?: number | null;
  /** Number of layout columns when scoring a resume built in the app. */
  columns?: number;
}

const BULLET_RE = /^[•\-*▪◦●○■□➢►✓·–—➤→]\s*/;
const METRIC_RE =
  /\d+(?:\.\d+)?\s?%|[$€£₹]\s?\d|\b\d+(?:\.\d+)?\s?(?:k|m|bn|x|million|billion|thousand|hours?|users?|clients?|customers?|people|members|projects|accounts|countries|stores|students|patients|leads|deals|engineers|employees)\b|\b(?!(?:19|20)\d{2}\b)\d{2,}\+?(?![\d/])/i;
const IGNORED_ACRONYMS = new Set(['US', 'USA', 'UK', 'EEO', 'EOE', 'LLC', 'INC', 'FAQ', 'ETC', 'PTO', 'OR', 'AND', 'THE', 'NA']);

const regexCache = new Map<string, RegExp>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function keywordRegex(keyword: string, flags = 'i'): RegExp {
  const cacheKey = `${flags}:${keyword}`;
  let regex = regexCache.get(cacheKey);
  if (!regex) {
    const body = escapeRegex(keyword).replace(/\s+/g, '[\\s-]+');
    regex = new RegExp(`(?<![A-Za-z0-9+#])${body}(?:e?s)?(?![A-Za-z0-9+#])`, flags);
    regexCache.set(cacheKey, regex);
  }
  return regex;
}

export function containsKeyword(text: string, keyword: string): boolean {
  return keywordRegex(keyword).test(text);
}

export function detectSkills(text: string): string[] {
  const found: string[] = [];
  for (const skill of SKILLS) {
    if (containsKeyword(text, skill) && !found.some((f) => f.toLowerCase() === skill.toLowerCase())) found.push(skill);
  }
  return found;
}

/** Ranks the most important keywords of a job description. */
export function extractJobKeywords(jobDescription: string, max = 30): string[] {
  const text = jobDescription.replace(/\s+/g, ' ');
  const scores = new Map<string, { label: string; score: number }>();
  const add = (label: string, score: number) => {
    const key = label.toLowerCase();
    const current = scores.get(key);
    if (current) current.score += score;
    else scores.set(key, { label, score });
  };

  for (const skill of SKILLS) {
    const occurrences = text.match(keywordRegex(skill, 'gi'))?.length ?? 0;
    if (occurrences) add(skill, 6 + occurrences * 2);
  }

  for (const match of text.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)) {
    if (!IGNORED_ACRONYMS.has(match[0]) && !STOPWORDS.has(match[0].toLowerCase())) add(match[0], 2);
  }

  const tokens = (text.toLowerCase().match(/[a-z][a-z+#.\-/]{2,}/g) ?? []).map((t) => t.replace(/[.\-/]+$/, ''));
  const unigrams = new Map<string, number>();
  const bigrams = new Map<string, number>();
  tokens.forEach((token, index) => {
    if (token.length < 3 || STOPWORDS.has(token)) return;
    unigrams.set(token, (unigrams.get(token) ?? 0) + 1);
    const next = tokens[index + 1];
    if (next && next.length > 2 && !STOPWORDS.has(next)) {
      const pair = `${token} ${next}`;
      bigrams.set(pair, (bigrams.get(pair) ?? 0) + 1);
    }
  });
  for (const [token, count] of unigrams) if (count >= 2) add(token, count);
  for (const [pair, count] of bigrams) if (count >= 2) add(pair, count * 1.6);

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score).map((v) => v.label);
  const selected: string[] = [];
  const parts = (value: string) => value.split(/[\s/]+/);
  for (const keyword of ranked) {
    const lower = keyword.toLowerCase();
    const redundant = selected.some((s) => {
      const other = s.toLowerCase();
      return other === lower || parts(other).includes(lower) || parts(lower).includes(other);
    });
    if (!redundant) selected.push(keyword);
    if (selected.length >= max) break;
  }
  return selected;
}

function detectSections(lines: string[]): Set<string> {
  const found = new Set<string>();
  for (const line of lines) {
    const head = line.includes(':') ? line.split(':')[0] : line;
    const normalized = head
      .toLowerCase()
      .replace(/[^a-z& ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized || normalized.split(' ').length > 5) continue;
    for (const [key, synonyms] of Object.entries(SECTION_SYNONYMS)) {
      if (synonyms.some((s) => normalized === s || normalized.startsWith(`${s} `) || normalized.endsWith(` ${s}`))) {
        found.add(key);
      }
    }
  }
  return found;
}

function isHeadingLine(line: string): boolean {
  return detectSections([line]).size > 0 && line.split(/\s+/).length <= 5;
}

function detectContact(text: string): AtsStats['contact'] {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] ?? null;
  let phone: string | null = null;
  for (const match of text.matchAll(/\+?[\d(][\d\s().-]{6,}\d/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15 && !/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(match[0].trim())) {
      phone = match[0].trim();
      break;
    }
  }
  const linkedin = /linkedin\.com\/[A-Za-z0-9_/%-]+/i.exec(text)?.[0] ?? null;
  const github = /github\.com\/[A-Za-z0-9_-]+/i.exec(text)?.[0] ?? null;
  let website: string | null = null;
  for (const match of text.matchAll(
    /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|dev|io|me|net|org|co|app|tech|design|site|xyz|ai|pk|in|uk|ca|au)(?:\/[^\s|,]*)?/gi,
  )) {
    const url = match[0];
    const index = match.index ?? 0;
    const precededByAt = index > 0 && text[index - 1] === '@';
    if (!precededByAt && !/linkedin|github|@/i.test(url) && !(email && email.includes(url))) {
      website = url;
      break;
    }
  }
  return { email, phone, linkedin, website, github };
}

function status(score: number, max: number): AtsStatus {
  const ratio = max ? score / max : 0;
  return ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'warn' : 'bad';
}

const round = (value: number) => Math.round(value * 10) / 10;

export function scoreResume(input: AtsInput): AtsResult {
  const text = input.text.replace(/\r\n?/g, '\n');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const words = text.match(/[A-Za-z][A-Za-z'+#./-]*/g) ?? [];
  const wordCount = words.length;
  const issues: AtsIssue[] = [];
  const breakdown: AtsCategoryResult[] = [];

  // 1. Contact information (10)
  const contact = detectContact(text);
  {
    let score = 0;
    const details: string[] = [];
    if (contact.email) {
      score += 4;
      details.push(`Email found: ${contact.email}`);
    } else {
      issues.push({
        severity: 'critical',
        category: 'contact',
        message: 'No email address detected.',
        fix: 'Add a professional email in the header as plain text (not inside an image or header/footer).',
      });
    }
    if (contact.phone) {
      score += 3;
      details.push('Phone number found');
    } else {
      issues.push({
        severity: 'warning',
        category: 'contact',
        message: 'No phone number detected.',
        fix: 'Add a phone number with country code, e.g. +1 555 123 4567.',
      });
    }
    if (contact.linkedin || contact.website || contact.github) {
      score += 3;
      details.push('Online profile found (LinkedIn / portfolio / GitHub)');
    } else {
      issues.push({
        severity: 'info',
        category: 'contact',
        message: 'No LinkedIn profile or portfolio link found.',
        fix: 'Recruiters expect a LinkedIn URL — add linkedin.com/in/your-name.',
      });
    }
    breakdown.push({ key: 'contact', label: 'Contact Information', score, max: 10, status: status(score, 10), details });
  }

  // 2. Section structure (15)
  const sections = detectSections(lines);
  {
    const weights: Array<[string, number, AtsIssue['severity'], string]> = [
      ['experience', 5, 'critical', 'Add a "Work Experience" section with clearly labelled roles, companies and dates.'],
      ['education', 4, 'warning', 'Add an "Education" section — most ATS filters check for it.'],
      ['skills', 3, 'warning', 'Add a dedicated "Skills" section listing your hard skills as keywords.'],
      ['summary', 3, 'info', 'Add a 2-4 sentence "Professional Summary" tailored to your target role.'],
    ];
    let score = 0;
    const details: string[] = [];
    for (const [key, points, severity, fix] of weights) {
      if (sections.has(key)) {
        score += points;
        details.push(`${key[0].toUpperCase()}${key.slice(1)} section detected`);
      } else {
        issues.push({ severity, category: 'sections', message: `Missing a standard "${key}" section heading.`, fix });
      }
    }
    const extras = ['projects', 'certifications', 'awards', 'languages', 'volunteer'].filter((k) => sections.has(k));
    if (extras.length) details.push(`Bonus sections: ${extras.join(', ')}`);
    breakdown.push({ key: 'sections', label: 'Resume Sections', score, max: 15, status: status(score, 15), details });
  }

  // 3. Keywords (25)
  const detectedSkills = detectSkills(text);
  let keywordResult: AtsKeywordResult;
  {
    const details: string[] = [];
    let score: number;
    const jd = input.jobDescription?.trim();
    const jdKeywords = jd ? extractJobKeywords(jd) : [];
    if (jd && jdKeywords.length >= 3) {
      const matched = jdKeywords.filter((k) => containsKeyword(text, k));
      const missing = jdKeywords.filter((k) => !matched.includes(k));
      const matchRate = matched.length / jdKeywords.length;
      score = 25 * Math.min(1, matchRate / 0.75);
      keywordResult = { source: 'job-description', matched, missing, matchRate: round(matchRate * 100), detectedSkills };
      details.push(`${matched.length} of ${jdKeywords.length} job keywords found (${Math.round(matchRate * 100)}% match)`);
      if (missing.length) {
        issues.push({
          severity: matchRate < 0.5 ? 'critical' : 'warning',
          category: 'keywords',
          message: `Missing ${missing.length} keyword${missing.length > 1 ? 's' : ''} from the job description: ${missing
            .slice(0, 8)
            .join(', ')}${missing.length > 8 ? '…' : ''}`,
          fix: 'Weave the missing keywords naturally into your summary, skills and experience bullets — only where they are true for you.',
        });
      }
    } else {
      score = Math.min(25, 5 + detectedSkills.length * 2);
      keywordResult = { source: 'general', matched: detectedSkills, missing: [], matchRate: null, detectedSkills };
      details.push(`${detectedSkills.length} recognised skills / keywords detected`);
      details.push('Tip: paste a job description to get an exact keyword match score.');
      if (detectedSkills.length < 8) {
        issues.push({
          severity: 'warning',
          category: 'keywords',
          message: `Only ${detectedSkills.length} industry keywords detected.`,
          fix: 'List specific tools, technologies and methodologies you use (e.g. "Excel", "Salesforce", "Agile").',
        });
      }
    }
    breakdown.push({
      key: 'keywords',
      label: 'Keyword Optimization',
      score: round(score),
      max: 25,
      status: status(score, 25),
      details,
    });
  }

  // 4. Impact & action verbs (15)
  const bulletLines = lines.filter((l) => BULLET_RE.test(l)).map((l) => l.replace(BULLET_RE, '').trim());
  const contentLines = lines.filter(
    (l) => l.split(/\s+/).length >= 5 && !isHeadingLine(l) && !/@|linkedin\.com|github\.com/i.test(l),
  );
  const statements = bulletLines.length >= 3 ? bulletLines : contentLines;
  const firstWord = (s: string) => s.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, '') ?? '';
  const actionVerbCount = statements.filter((s) => ACTION_VERBS.has(firstWord(s))).length;
  const quantifiedCount = statements.filter((s) => METRIC_RE.test(s)).length;
  const lowerText = text.toLowerCase();
  const weakPhrases = WEAK_PHRASES.filter((p) => lowerText.includes(p));
  {
    const details: string[] = [];
    const verbRatio = statements.length ? actionVerbCount / statements.length : 0;
    // A couple of good bullets should not earn full marks — scale by how much evidence there is.
    const volume = 0.4 + 0.6 * Math.min(1, statements.length / 6);
    let score = 8 * Math.min(1, verbRatio / 0.6) * volume + 7 * Math.min(1, quantifiedCount / 4);
    score -= Math.min(4, weakPhrases.length);
    score = Math.max(0, score);
    details.push(`${actionVerbCount} of ${statements.length} statements start with a strong action verb`);
    details.push(`${quantifiedCount} statements include measurable results (numbers, %, $)`);
    if (verbRatio < 0.5 && statements.length) {
      issues.push({
        severity: 'warning',
        category: 'impact',
        message: 'Many bullet points do not start with an action verb.',
        fix: 'Begin each bullet with verbs like "Led", "Built", "Increased", "Reduced", "Launched".',
      });
    }
    if (quantifiedCount < 3) {
      issues.push({
        severity: 'warning',
        category: 'impact',
        message: `Only ${quantifiedCount} achievement${quantifiedCount === 1 ? '' : 's'} quantified with numbers.`,
        fix: 'Add metrics: team size, % improvement, revenue, time saved, users served, budget managed.',
      });
    }
    if (weakPhrases.length) {
      issues.push({
        severity: 'info',
        category: 'impact',
        message: `Weak phrases found: "${weakPhrases.slice(0, 4).join('", "')}"`,
        fix: 'Replace passive phrases such as "responsible for" with direct accomplishments ("Managed…", "Delivered…").',
      });
    }
    breakdown.push({
      key: 'impact',
      label: 'Impact & Achievements',
      score: round(score),
      max: 15,
      status: status(score, 15),
      details,
    });
  }

  // 5. Length & density (10)
  const avgBulletWords = bulletLines.length
    ? round(bulletLines.reduce((sum, b) => sum + b.split(/\s+/).length, 0) / bulletLines.length)
    : 0;
  {
    const details: string[] = [`${wordCount} words`, `${bulletLines.length} bullet points`];
    let score: number;
    if (wordCount < 200) score = 2;
    else if (wordCount < 350) score = 6;
    else if (wordCount <= 900) score = 10;
    else if (wordCount <= 1200) score = 8;
    else score = 5;
    if (wordCount < 350) {
      issues.push({
        severity: wordCount < 200 ? 'critical' : 'warning',
        category: 'length',
        message: `Resume is short (${wordCount} words).`,
        fix: 'Aim for 400-800 words: expand experience bullets with scope, actions and results.',
      });
    } else if (wordCount > 1200) {
      issues.push({
        severity: 'warning',
        category: 'length',
        message: `Resume is long (${wordCount} words).`,
        fix: 'Trim to the most relevant 10-15 years and keep 3-6 bullets per role.',
      });
    }
    if (input.pages && input.pages > 2) {
      score -= 3;
      details.push(`${input.pages} pages`);
      issues.push({
        severity: 'warning',
        category: 'length',
        message: `Resume is ${input.pages} pages long.`,
        fix: 'Keep it to 1 page (junior) or 2 pages (experienced) unless it is an academic CV.',
      });
    }
    if (avgBulletWords > 32) {
      score -= 2;
      issues.push({
        severity: 'info',
        category: 'length',
        message: `Bullets average ${avgBulletWords} words.`,
        fix: 'Keep each bullet to 1-2 lines (about 12-25 words) so recruiters can skim.',
      });
    }
    score = Math.max(0, score);
    breakdown.push({ key: 'length', label: 'Length & Density', score, max: 10, status: status(score, 10), details });
  }

  // 6. ATS parseability / formatting (15)
  {
    let score = 15;
    const details: string[] = [];
    if (input.sourceKind === 'image' || input.extractionMethod === 'ocr') {
      score -= 10;
      issues.push({
        severity: 'critical',
        category: 'formatting',
        message:
          input.sourceKind === 'image'
            ? 'Image files are not readable by most ATS systems.'
            : 'This PDF is image-based (scanned) — ATS systems see an empty document.',
        fix: 'Export your resume as a text-based PDF or DOCX (e.g. from this builder) before applying.',
      });
    } else {
      details.push('Text is machine-readable');
    }
    if (input.sourceKind === 'doc') {
      score -= 2;
      issues.push({
        severity: 'info',
        category: 'formatting',
        message: 'Legacy .doc format.',
        fix: 'Save as .docx or PDF for better compatibility.',
      });
    }
    const privateUse = text.match(/[-]/g)?.length ?? 0;
    if (privateUse > 0) {
      score -= 3;
      issues.push({
        severity: 'warning',
        category: 'formatting',
        message: `${privateUse} unreadable icon/symbol characters detected.`,
        fix: 'Icon fonts turn into garbage characters in ATS — use plain text labels like "Email:" instead of icons.',
      });
    }
    const shortLines = lines.filter((l) => l.split(/\s+/).length <= 2 && !isHeadingLine(l)).length;
    if (lines.length > 20 && shortLines / lines.length > 0.45) {
      score -= 3;
      issues.push({
        severity: 'warning',
        category: 'formatting',
        message: 'Text looks fragmented — possibly tables, text boxes or multiple columns.',
        fix: 'Use a single-column layout without tables or text boxes so ATS reads content in the right order.',
      });
    }
    if (input.columns && input.columns > 1) {
      score -= 4;
      issues.push({
        severity: 'warning',
        category: 'formatting',
        message: 'Two-column template selected.',
        fix: 'Some older ATS read columns out of order. Switch to an "ATS-Friendly" single-column template for online applications.',
      });
    }
    const dateStyles = new Set<string>();
    if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}/i.test(text)) dateStyles.add('month-name');
    if (/\b\d{1,2}\/\d{4}\b/.test(text)) dateStyles.add('numeric');
    if (/\b\d{4}-\d{2}\b/.test(text)) dateStyles.add('iso');
    if (dateStyles.size > 1) {
      score -= 1;
      issues.push({
        severity: 'info',
        category: 'formatting',
        message: 'Inconsistent date formats.',
        fix: 'Use one date format everywhere, e.g. "Jan 2022 – Present".',
      });
    } else if (dateStyles.size === 1) {
      details.push('Consistent date format');
    }
    if (/[\u{1F300}-\u{1FAFF}]/u.test(text)) {
      score -= 1;
      issues.push({
        severity: 'info',
        category: 'formatting',
        message: 'Emoji detected.',
        fix: 'Remove emoji — they can break ATS parsing and look unprofessional.',
      });
    }
    score = Math.max(0, score);
    breakdown.push({ key: 'formatting', label: 'ATS Parseability', score, max: 15, status: status(score, 15), details });
  }

  // 7. Language & readability (10)
  const pronounCount = (text.match(/\bI\b/g)?.length ?? 0) + (text.match(/\b(me|my|mine|myself)\b/gi)?.length ?? 0);
  const buzzwords = BUZZWORDS.filter((b) => lowerText.includes(b));
  {
    let score = 10;
    const details: string[] = [];
    if (pronounCount > 1) {
      score -= Math.min(4, pronounCount - 1);
      issues.push({
        severity: 'info',
        category: 'language',
        message: `${pronounCount} first-person pronouns ("I", "my", "me").`,
        fix: 'Resumes use implied first person — write "Led a team of 5" instead of "I led a team of 5".',
      });
    } else {
      details.push('No first-person pronouns');
    }
    if (buzzwords.length > 1) {
      score -= Math.min(3, buzzwords.length - 1);
      issues.push({
        severity: 'info',
        category: 'language',
        message: `Clichés detected: ${buzzwords.slice(0, 5).join(', ')}.`,
        fix: 'Show these qualities through concrete achievements instead of stating them.',
      });
    }
    const verbUsage = new Map<string, number>();
    for (const s of statements) {
      const verb = firstWord(s);
      if (ACTION_VERBS.has(verb)) verbUsage.set(verb, (verbUsage.get(verb) ?? 0) + 1);
    }
    const overused = [...verbUsage.entries()].filter(([, count]) => count > 3).map(([verb]) => verb);
    if (overused.length) {
      score -= Math.min(2, overused.length);
      issues.push({
        severity: 'info',
        category: 'language',
        message: `Repetitive verbs: ${overused.join(', ')}.`,
        fix: 'Vary your action verbs (e.g. "Managed" → "Directed", "Oversaw", "Coordinated").',
      });
    }
    if (avgBulletWords && avgBulletWords <= 28) details.push('Concise, skimmable bullet points');
    score = Math.max(0, score);
    breakdown.push({ key: 'language', label: 'Language & Readability', score, max: 10, status: status(score, 10), details });
  }

  const total = Math.round(breakdown.reduce((sum, c) => sum + c.score, 0));
  // Very thin resumes cannot be strong no matter how clean they are.
  const cap = wordCount < 120 ? 50 : wordCount < 200 ? 75 : 100;
  const score = Math.max(0, Math.min(cap, total));
  const grade: AtsResult['grade'] = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Needs Work';
  const weakest = [...breakdown].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  const summary =
    cap < 100 && total > cap
      ? `Score capped at ${cap} because the resume is too short (${wordCount} words) — add more detail about your experience and achievements.`
      : grade === 'Excellent'
        ? 'Your resume is highly optimized for ATS systems. Fine-tune keywords for each job you apply to.'
        : `${grade} — the biggest opportunity is "${weakest.label}" (${weakest.score}/${weakest.max}). Fix the critical issues first.`;

  const severityRank = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    score,
    grade,
    summary,
    breakdown,
    keywords: keywordResult,
    issues,
    stats: {
      wordCount,
      bulletCount: bulletLines.length,
      actionVerbCount,
      quantifiedCount,
      avgBulletWords,
      pronounCount,
      weakPhrases,
      buzzwords,
      sectionsFound: [...sections],
      sectionsMissing: ['summary', 'experience', 'education', 'skills'].filter((s) => !sections.has(s)),
      contact,
      pages: input.pages ?? null,
      readingTimeSec: Math.round((wordCount / 230) * 60),
    },
  };
}
