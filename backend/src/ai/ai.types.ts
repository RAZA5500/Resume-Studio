import { normalizeContent } from '../common/resume/resume-defaults.js';
import type { ResumeContent } from '../common/types/resume.types.js';

export type AiSource = 'ai' | 'offline';

/** Shape returned by the model for RESUME_SCHEMA. */
export interface AiResume {
  personal: Record<string, string>;
  summary: string;
  experience: Array<{
    jobTitle: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    location: string;
    startDate: string;
    endDate: string;
    gpa: string;
    details: string;
  }>;
  skills: string[];
  projects: Array<{ name: string; role: string; link: string; bullets: string[] }>;
  certifications: Array<{ name: string; issuer: string; date: string }>;
  languages: Array<{ name: string; proficiency: string }>;
  awards: Array<{ title: string; issuer: string; date: string; description: string }>;
  interests: string[];
}

export interface AiAnalysis {
  overallScore: number;
  verdict: 'Excellent' | 'Strong' | 'Average' | 'Weak';
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: Array<{ section: string; priority: 'high' | 'medium' | 'low'; issue: string; suggestion: string }>;
  missingKeywords: string[];
  rewrittenSummary: string;
  bulletRewrites: Array<{ original: string; improved: string }>;
  jobMatch: { score: number; verdict: string; gaps: string[] } | null;
  recommendedRoles: string[];
}

export interface SkillSuggestions {
  hardSkills: string[];
  softSkills: string[];
  tools: string[];
}

export interface TailorResult {
  content: ResumeContent;
  changes: string[];
  addedKeywords: string[];
  source: AiSource;
}

export interface CoverLetter {
  subject: string;
  body: string;
}

export function aiResumeToContent(raw: Partial<AiResume>): ResumeContent {
  const bullets = (items?: string[]) => (items ?? []).map((b) => b.trim()).filter(Boolean).join('\n');
  return normalizeContent({
    personal: raw.personal ?? {},
    summary: raw.summary ?? '',
    experience: (raw.experience ?? []).map((e) => ({ ...e, description: bullets(e.bullets) })),
    education: (raw.education ?? []).map((e) => ({ ...e, description: e.details })),
    skills: (raw.skills ?? []).map((name) => ({ name, level: 0 })),
    projects: (raw.projects ?? []).map((p) => ({ ...p, description: bullets(p.bullets) })),
    certifications: raw.certifications ?? [],
    languages: raw.languages ?? [],
    awards: raw.awards ?? [],
    interests: (raw.interests ?? []).map((name) => ({ name })),
  });
}
