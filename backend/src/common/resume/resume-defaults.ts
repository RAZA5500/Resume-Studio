import {
  BUILT_IN_SECTIONS,
  type CustomSection,
  type ResumeContent,
} from '../types/resume.types.js';
import { uid } from '../utils.js';

type Dict = Record<string, unknown>;

const obj = (value: unknown): Dict =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const bool = (value: unknown): boolean => value === true || value === 'true';
const str = (value: unknown, max = 2000): string => {
  if (typeof value === 'string') return value.slice(0, max);
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};
const level = (value: unknown): number => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0;
};

export function createEmptyContent(fullName = '', email = ''): ResumeContent {
  return {
    personal: {
      fullName,
      jobTitle: '',
      email,
      phone: '',
      location: '',
      website: '',
      linkedin: '',
      github: '',
      photo: '',
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    awards: [],
    interests: [],
    customSections: [],
    sectionOrder: [...BUILT_IN_SECTIONS],
    hiddenSections: [],
    sectionTitles: {},
  };
}

export function createSampleContent(): ResumeContent {
  return normalizeContent({
    personal: {
      fullName: 'Alex Morgan',
      jobTitle: 'Senior Software Engineer',
      email: 'alex.morgan@email.com',
      phone: '+1 (555) 123-4567',
      location: 'San Francisco, CA',
      website: 'alexmorgan.dev',
      linkedin: 'linkedin.com/in/alexmorgan',
      github: 'github.com/alexmorgan',
    },
    summary:
      'Senior software engineer with 7+ years of experience building scalable web applications and cloud services. Led cross-functional teams to ship products used by 2M+ users while cutting infrastructure costs by 35%. Passionate about clean architecture, mentoring and data-driven product development.',
    experience: [
      {
        jobTitle: 'Senior Software Engineer',
        company: 'Nimbus Cloud Inc.',
        location: 'San Francisco, CA',
        startDate: '2021-03',
        current: true,
        description: [
          'Led development of a microservices platform serving 2M+ monthly active users with 99.95% uptime',
          'Reduced AWS infrastructure costs by 35% by redesigning data pipelines and autoscaling policies',
          'Mentored 6 engineers and introduced review standards that cut production bugs by 40%',
          'Partnered with product and design to launch 12 customer-facing features in 18 months',
        ].join('\n'),
      },
      {
        jobTitle: 'Software Engineer',
        company: 'BrightPath Analytics',
        location: 'Austin, TX',
        startDate: '2018-06',
        endDate: '2021-02',
        description: [
          'Built real-time analytics dashboards in Angular and NestJS used by 300+ enterprise clients',
          'Improved API response times by 60% through query optimization and Redis caching',
          'Automated CI/CD pipelines with GitHub Actions, reducing release time from days to hours',
        ].join('\n'),
      },
    ],
    education: [
      {
        degree: 'B.S. Computer Science',
        institution: 'University of Texas at Austin',
        location: 'Austin, TX',
        startDate: '2014-08',
        endDate: '2018-05',
        gpa: '3.8 / 4.0',
        description: "Dean's List · Teaching Assistant for Data Structures",
      },
    ],
    skills: [
      ['TypeScript', 5],
      ['Angular', 5],
      ['Node.js', 5],
      ['NestJS', 4],
      ['PostgreSQL', 4],
      ['AWS', 4],
      ['Docker', 4],
      ['Kubernetes', 3],
      ['System Design', 4],
      ['CI/CD', 4],
    ].map(([name, lvl]) => ({ name, level: lvl })),
    projects: [
      {
        name: 'OpenMetrics Dashboard',
        role: 'Creator',
        link: 'github.com/alexmorgan/openmetrics',
        description:
          'Open-source monitoring dashboard with 2.4k GitHub stars\nPlugin architecture supporting 15+ data sources',
      },
    ],
    certifications: [
      { name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', date: '2022-04' },
    ],
    languages: [
      { name: 'English', proficiency: 'Native' },
      { name: 'Spanish', proficiency: 'Professional' },
    ],
    awards: [
      {
        title: 'Engineering Excellence Award',
        issuer: 'Nimbus Cloud Inc.',
        date: '2023-12',
        description: 'Recognized for leading the zero-downtime platform migration',
      },
    ],
    interests: [{ name: 'Open Source' }, { name: 'Hiking' }, { name: 'Photography' }],
  });
}

/**
 * Coerces any (possibly partial or AI generated) object into a complete, valid
 * ResumeContent so the renderer and exporters never meet missing fields.
 */
export function normalizeContent(input: unknown): ResumeContent {
  const src = obj(input);
  const personal = obj(src['personal']);

  const customSections: CustomSection[] = arr(src['customSections']).map((raw) => {
    const section = obj(raw);
    return {
      id: str(section['id'], 40) || uid(),
      title: str(section['title'], 80) || 'Custom Section',
      items: arr(section['items']).map((itemRaw) => {
        const item = obj(itemRaw);
        return {
          id: str(item['id'], 40) || uid(),
          title: str(item['title'], 200),
          subtitle: str(item['subtitle'], 200),
          date: str(item['date'], 40),
          description: str(item['description'], 6000),
        };
      }),
    };
  });

  const content: ResumeContent = {
    personal: {
      fullName: str(personal['fullName'], 120),
      jobTitle: str(personal['jobTitle'], 160),
      email: str(personal['email'], 160),
      phone: str(personal['phone'], 60),
      location: str(personal['location'], 160),
      website: str(personal['website'], 200),
      linkedin: str(personal['linkedin'], 200),
      github: str(personal['github'], 200),
      photo: str(personal['photo'], 4_000_000),
    },
    summary: str(src['summary'], 5000),
    experience: arr(src['experience']).map((raw) => {
      const e = obj(raw);
      return {
        id: str(e['id'], 40) || uid(),
        jobTitle: str(e['jobTitle'], 160),
        company: str(e['company'], 160),
        location: str(e['location'], 160),
        startDate: str(e['startDate'], 40),
        endDate: str(e['endDate'], 40),
        current: bool(e['current']),
        description: str(e['description'], 8000),
      };
    }),
    education: arr(src['education']).map((raw) => {
      const e = obj(raw);
      return {
        id: str(e['id'], 40) || uid(),
        degree: str(e['degree'], 200),
        institution: str(e['institution'], 200),
        location: str(e['location'], 160),
        startDate: str(e['startDate'], 40),
        endDate: str(e['endDate'], 40),
        current: bool(e['current']),
        gpa: str(e['gpa'], 40),
        description: str(e['description'], 4000),
      };
    }),
    skills: arr(src['skills'])
      .map((raw) => {
        const s = typeof raw === 'string' ? { name: raw } : obj(raw);
        return { id: str(s['id'], 40) || uid(), name: str(s['name'], 80).trim(), level: level(s['level']) };
      })
      .filter((s) => s.name),
    projects: arr(src['projects']).map((raw) => {
      const p = obj(raw);
      return {
        id: str(p['id'], 40) || uid(),
        name: str(p['name'], 200),
        role: str(p['role'], 160),
        link: str(p['link'], 300),
        startDate: str(p['startDate'], 40),
        endDate: str(p['endDate'], 40),
        description: str(p['description'], 6000),
      };
    }),
    certifications: arr(src['certifications']).map((raw) => {
      const c = obj(raw);
      return {
        id: str(c['id'], 40) || uid(),
        name: str(c['name'], 200),
        issuer: str(c['issuer'], 200),
        date: str(c['date'], 40),
        link: str(c['link'], 300),
      };
    }),
    languages: arr(src['languages']).map((raw) => {
      const l = typeof raw === 'string' ? { name: raw } : obj(raw);
      return { id: str(l['id'], 40) || uid(), name: str(l['name'], 80), proficiency: str(l['proficiency'], 80) };
    }),
    awards: arr(src['awards']).map((raw) => {
      const a = obj(raw);
      return {
        id: str(a['id'], 40) || uid(),
        title: str(a['title'], 200),
        issuer: str(a['issuer'], 200),
        date: str(a['date'], 40),
        description: str(a['description'], 2000),
      };
    }),
    interests: arr(src['interests'])
      .map((raw) => {
        const i = typeof raw === 'string' ? { name: raw } : obj(raw);
        return { id: str(i['id'], 40) || uid(), name: str(i['name'], 80).trim() };
      })
      .filter((i) => i.name),
    customSections,
    sectionOrder: [],
    hiddenSections: arr(src['hiddenSections']).map((v) => str(v, 60)).filter(Boolean),
    sectionTitles: Object.fromEntries(
      Object.entries(obj(src['sectionTitles']))
        .map(([key, value]) => [key, str(value, 80)] as const)
        .filter(([, value]) => value),
    ),
  };

  content.sectionOrder = normalizeSectionOrder(arr(src['sectionOrder']).map((v) => str(v, 60)), customSections);
  return content;
}

function normalizeSectionOrder(order: string[], customSections: CustomSection[]): string[] {
  const valid = new Set<string>([...BUILT_IN_SECTIONS, ...customSections.map((s) => `custom:${s.id}`)]);
  const result: string[] = [];
  for (const key of order) {
    if (valid.has(key) && !result.includes(key)) result.push(key);
  }
  for (const key of valid) {
    if (!result.includes(key)) result.push(key);
  }
  return result;
}
