import { extractJobKeywords } from '../ats/ats-scorer.js';
import { createSampleContent } from '../common/resume/resume-defaults.js';
import { improveLine, offlineGenerateResume, offlineParseResume, offlineSummaries } from './ai-fallback.js';

describe('offline AI fallback', () => {
  it('rewrites weak bullet openings', () => {
    expect(improveLine('Responsible for managing the website')).toBe('Managed the website');
    expect(improveLine('worked on fixing bugs')).toBe('Fixed bugs');
    expect(improveLine('- helped the team with deployments.')).toBe('Supported the team with deployments');
    expect(improveLine('Leading a team of 5 engineers')).toBe('Led a team of 5 engineers');
  });

  it('writes grammatical summaries', () => {
    const [first, second] = offlineSummaries(createSampleContent());
    expect(first).not.toMatch(/ability to led/);
    expect(second).not.toMatch(/results-driven/i);
  });

  it('extracts details from a free-text prompt', () => {
    const content = offlineGenerateResume(
      'My name is Sara Khan, I am a marketing specialist with 4 years experience in SEO and Google Ads. BBA from LUMS. sara@mail.com',
    );
    expect(content.personal.fullName).toBe('Sara Khan');
    expect(content.personal.email).toBe('sara@mail.com');
    expect(content.education[0]).toMatchObject({ degree: 'BBA', institution: 'LUMS' });
  });

  it('parses a plain text resume into sections', () => {
    const content = offlineParseResume(`John Carter
Product Manager
john@carter.io | +1 555 222 3333 | Austin, TX

SUMMARY
Product manager with 6 years of experience.

EXPERIENCE
Senior Product Manager
Acme Corp | Jan 2021 - Present
• Launched 3 products generating $2M ARR
• Led a team of 8

EDUCATION
MBA, University of Texas
2014 - 2016

SKILLS
Roadmapping, Agile, SQL, Stakeholder Management`);
    expect(content.personal.fullName).toBe('John Carter');
    expect(content.personal.email).toBe('john@carter.io');
    expect(content.experience).toHaveLength(1);
    expect(content.experience[0]).toMatchObject({ jobTitle: 'Senior Product Manager', current: true, startDate: '2021-01' });
    expect(content.experience[0].description.split('\n')).toHaveLength(2);
    expect(content.skills.map((s) => s.name)).toEqual(['Roadmapping', 'Agile', 'SQL', 'Stakeholder Management']);
  });

  it('does not split compound keywords', () => {
    const keywords = extractJobKeywords('Must know CI/CD pipelines. CI/CD with GitHub Actions is required.');
    expect(keywords).toContain('CI/CD');
    expect(keywords).not.toContain('CI');
  });
});
