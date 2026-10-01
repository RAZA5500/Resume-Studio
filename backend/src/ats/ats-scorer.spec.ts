import { createSampleContent } from '../common/resume/resume-defaults.js';
import { resumeToPlainText } from '../common/resume/resume-text.js';
import { containsKeyword, extractJobKeywords, scoreResume } from './ats-scorer.js';

const JOB = `Senior Frontend Engineer
We are looking for an engineer with strong TypeScript and Angular experience.
You will build dashboards, work with Node.js APIs and PostgreSQL, and deploy on AWS with Docker.
Experience with CI/CD, unit testing and GraphQL is a plus. Angular and TypeScript are required.`;

describe('ATS scorer', () => {
  const sampleText = resumeToPlainText(createSampleContent());

  it('scores a well structured resume highly', () => {
    const result = scoreResume({ text: sampleText, sourceKind: 'resume' });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.breakdown).toHaveLength(7);
    expect(result.breakdown.reduce((sum, c) => sum + c.max, 0)).toBe(100);
    expect(result.stats.contact.email).toBe('alex.morgan@email.com');
    expect(result.stats.sectionsFound).toEqual(expect.arrayContaining(['experience', 'education', 'skills', 'summary']));
  });

  it('penalises weak, short, unstructured text', () => {
    const result = scoreResume({ text: 'I am a hard-working team player. I was responsible for various tasks.' });
    expect(result.score).toBeLessThan(40);
    expect(result.grade).toBe('Needs Work');
    expect(result.issues.some((i) => i.severity === 'critical')).toBe(true);
  });

  it('matches job description keywords', () => {
    const keywords = extractJobKeywords(JOB);
    expect(keywords).toEqual(expect.arrayContaining(['TypeScript', 'Angular', 'PostgreSQL', 'AWS', 'Docker']));

    const result = scoreResume({ text: sampleText, jobDescription: JOB, sourceKind: 'resume' });
    expect(result.keywords.source).toBe('job-description');
    expect(result.keywords.matched).toEqual(expect.arrayContaining(['TypeScript', 'Angular']));
    expect(result.keywords.missing).toEqual(expect.arrayContaining(['GraphQL']));
  });

  it('flags image based sources as not ATS readable', () => {
    const result = scoreResume({ text: sampleText, sourceKind: 'image', extractionMethod: 'ocr' });
    const formatting = result.breakdown.find((c) => c.key === 'formatting');
    expect(formatting?.score).toBeLessThanOrEqual(5);
  });

  it('handles special-character skills', () => {
    expect(containsKeyword('Built services in C# and C++ on .NET', 'C#')).toBe(true);
    expect(containsKeyword('Built services in C# and C++ on .NET', 'C++')).toBe(true);
    expect(containsKeyword('Worked on ASP.NET apps', '.NET')).toBe(false);
    expect(containsKeyword('Built dashboards', 'dashboard')).toBe(true);
  });
});
