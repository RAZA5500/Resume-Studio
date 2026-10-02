/** JSON schemas for structured outputs (strict mode: every object is closed and fully required). */

type Schema = Record<string, unknown>;

const str = (description?: string): Schema => (description ? { type: 'string', description } : { type: 'string' });
const int = (description: string): Schema => ({ type: 'integer', description });
const list = (items: Schema, description?: string): Schema => ({
  type: 'array',
  items,
  ...(description ? { description } : {}),
});
const obj = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...(description ? { description } : {}),
});

const DATE = 'YYYY-MM or YYYY when known, otherwise an empty string';

export const RESUME_SCHEMA = obj({
  personal: obj({
    fullName: str(),
    jobTitle: str('Current or target professional title'),
    email: str(),
    phone: str(),
    location: str('City, Country or City, State'),
    website: str(),
    linkedin: str(),
    github: str(),
  }),
  summary: str('Professional summary, 2-4 sentences'),
  experience: list(
    obj({
      jobTitle: str(),
      company: str(),
      location: str(),
      startDate: str(DATE),
      endDate: str(`${DATE}; empty when current`),
      current: { type: 'boolean' },
      bullets: list(str('One achievement-focused bullet without a bullet symbol')),
    }),
  ),
  education: list(
    obj({
      degree: str(),
      institution: str(),
      location: str(),
      startDate: str(DATE),
      endDate: str(DATE),
      gpa: str(),
      details: str('Honors, coursework or activities; may be empty'),
    }),
  ),
  skills: list(str()),
  projects: list(obj({ name: str(), role: str(), link: str(), bullets: list(str()) })),
  certifications: list(obj({ name: str(), issuer: str(), date: str(DATE) })),
  languages: list(obj({ name: str(), proficiency: str() })),
  awards: list(obj({ title: str(), issuer: str(), date: str(DATE), description: str() })),
  interests: list(str()),
});

export const SUMMARY_SCHEMA = obj({ options: list(str(), 'Exactly three alternative summaries') });

export const IMPROVE_SCHEMA = obj({
  text: str('The improved text'),
  alternatives: list(str(), 'Up to two alternative versions'),
});

export const BULLETS_SCHEMA = obj({ bullets: list(str('Bullet text without a bullet symbol')) });

export const SKILLS_SCHEMA = obj({
  hardSkills: list(str()),
  softSkills: list(str()),
  tools: list(str()),
});

export const TAILOR_SCHEMA = obj({
  summary: str('Rewritten professional summary targeting the job'),
  skills: list(str(), 'Complete updated skills list, most relevant first'),
  experience: list(obj({ id: str('The id of the experience entry'), bullets: list(str()) })),
  addedKeywords: list(str()),
  changes: list(str(), 'Short human readable list of the main changes'),
});

export const COVER_LETTER_SCHEMA = obj({
  subject: str('Email subject line for the application'),
  body: str('Complete cover letter; paragraphs separated by a blank line; include greeting and sign-off'),
});

export const ANALYSIS_SCHEMA = obj({
  overallScore: int('Overall resume quality and ATS readiness from 0 to 100'),
  verdict: { type: 'string', enum: ['Excellent', 'Strong', 'Average', 'Weak'] },
  summary: str('2-3 sentence overall assessment'),
  strengths: list(str()),
  weaknesses: list(str()),
  suggestions: list(
    obj({
      section: str('Resume section this applies to'),
      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      issue: str(),
      suggestion: str(),
    }),
  ),
  missingKeywords: list(str()),
  rewrittenSummary: str(),
  bulletRewrites: list(obj({ original: str(), improved: str() })),
  jobMatch: obj({
    score: int('Fit with the job description from 0 to 100; 0 when no job description was provided'),
    verdict: str(),
    gaps: list(str()),
  }),
  recommendedRoles: list(str()),
});
