/**
 * Resume data model — mirrors backend/src/common/types/resume.types.ts.
 */

export interface PersonalInfo {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
  photo: string;
}

export interface ExperienceItem {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface EducationItem {
  id: string;
  degree: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  gpa: string;
  description: string;
}

export interface SkillItem {
  id: string;
  name: string;
  level: number;
}

export interface ProjectItem {
  id: string;
  name: string;
  role: string;
  link: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  link: string;
}

export interface LanguageItem {
  id: string;
  name: string;
  proficiency: string;
}

export interface AwardItem {
  id: string;
  title: string;
  issuer: string;
  date: string;
  description: string;
}

export interface InterestItem {
  id: string;
  name: string;
}

export interface CustomItem {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  description: string;
}

export interface CustomSection {
  id: string;
  title: string;
  items: CustomItem[];
}

export interface ResumeContent {
  personal: PersonalInfo;
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  languages: LanguageItem[];
  awards: AwardItem[];
  interests: InterestItem[];
  customSections: CustomSection[];
  sectionOrder: string[];
  hiddenSections: string[];
  sectionTitles: Record<string, string>;
}

export type HeadingStyle = 'line' | 'underline' | 'bar' | 'plain' | 'boxed' | 'dot' | 'double';
export type SkillStyle = 'tags' | 'bars' | 'dots' | 'list' | 'columns' | 'inline';
export type BulletStyle = 'disc' | 'dash' | 'arrow' | 'square' | 'check' | 'none';
export type DateFormat = 'MMM YYYY' | 'MMMM YYYY' | 'MM/YYYY' | 'YYYY';

export interface DesignSettings {
  layout: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  backgroundColor: string;
  sidebarColor: string;
  sidebarTextColor: string;
  headingFont: string;
  bodyFont: string;
  fontSize: number;
  lineHeight: number;
  margin: number;
  sectionGap: number;
  headingStyle: HeadingStyle;
  skillStyle: SkillStyle;
  bulletStyle: BulletStyle;
  headerAlign: 'left' | 'center';
  showPhoto: boolean;
  photoShape: 'circle' | 'rounded' | 'square';
  showIcons: boolean;
  uppercaseHeadings: boolean;
  dateFormat: DateFormat;
  pageSize: 'A4' | 'Letter';
  sidebarWidth: number;
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  templateId: string | null;
  content: ResumeContent;
  design: DesignSettings;
  atsScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export type SectionKey =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'awards'
  | 'interests';

export const BUILT_IN_SECTIONS: SectionKey[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'awards',
  'interests',
];

export const DEFAULT_SECTION_TITLES: Record<string, string> = {
  summary: 'Professional Summary',
  experience: 'Work Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
  awards: 'Awards & Achievements',
  interests: 'Interests',
};

export const SECTION_ICONS: Record<string, string> = {
  summary: 'notes',
  experience: 'work',
  education: 'school',
  skills: 'psychology',
  projects: 'rocket_launch',
  certifications: 'workspace_premium',
  languages: 'translate',
  awards: 'emoji_events',
  interests: 'interests',
};

/** Layouts with a sidebar column (not recommended for strict ATS parsing). */
export const TWO_COLUMN_LAYOUTS = ['sidebar', 'sidebar-right', 'banner', 'creative'];

export const LANGUAGE_LEVELS = ['Native', 'Fluent', 'Professional', 'Intermediate', 'Basic'];

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 12);

export function sectionTitle(content: ResumeContent, key: string): string {
  if (content.sectionTitles[key]) return content.sectionTitles[key];
  if (key.startsWith('custom:')) {
    return content.customSections.find((s) => `custom:${s.id}` === key)?.title ?? 'Section';
  }
  return DEFAULT_SECTION_TITLES[key] ?? key;
}

export function bulletLines(description: string): string[] {
  return (description ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*[•\-*▪◦●○■□➢►✓·–—]\s*/, '').trim())
    .filter(Boolean);
}

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

export function formatDate(value: string, format: DateFormat = 'MMM YYYY'): string {
  const match = /^(\d{4})-(\d{1,2})/.exec(value?.trim() ?? '');
  if (!match) return value?.trim() ?? '';
  const year = match[1];
  const month = Math.min(12, Math.max(1, Number(match[2]))) - 1;
  switch (format) {
    case 'MMMM YYYY':
      return `${MONTHS_LONG[month]} ${year}`;
    case 'MM/YYYY':
      return `${String(month + 1).padStart(2, '0')}/${year}`;
    case 'YYYY':
      return year;
    default:
      return `${MONTHS_SHORT[month]} ${year}`;
  }
}

export function dateRange(start: string, end: string, current: boolean, format: DateFormat = 'MMM YYYY'): string {
  const from = formatDate(start, format);
  const to = current ? 'Present' : formatDate(end, format);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

export function createEmptyContent(): ResumeContent {
  return {
    personal: {
      fullName: '',
      jobTitle: '',
      email: '',
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

/** Neutral avatar used for template previews that include a photo. */
export const SAMPLE_PHOTO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23cbd5e1'/><stop offset='1' stop-color='%2394a3b8'/></linearGradient></defs><rect width='120' height='120' fill='url(%23g)'/><circle cx='60' cy='47' r='22' fill='%23f8fafc'/><path d='M20 112c4-24 20-36 40-36s36 12 40 36' fill='%23f8fafc'/></svg>";

/** Example resume shown in template thumbnails and "start from example". */
export const SAMPLE_CONTENT: ResumeContent = {
  personal: {
    fullName: 'Alex Morgan',
    jobTitle: 'Senior Product Designer',
    email: 'alex.morgan@email.com',
    phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA',
    website: 'alexmorgan.design',
    linkedin: 'linkedin.com/in/alexmorgan',
    github: '',
    photo: '',
  },
  summary:
    'Product designer with 7+ years of experience crafting intuitive digital products for SaaS and fintech. Led end-to-end design for features used by 2M+ customers, lifting conversion by 28%. Skilled at turning research insights into elegant, accessible interfaces.',
  experience: [
    {
      id: 'e1',
      jobTitle: 'Senior Product Designer',
      company: 'Nimbus Cloud Inc.',
      location: 'San Francisco, CA',
      startDate: '2021-03',
      endDate: '',
      current: true,
      description:
        'Led redesign of the onboarding flow, increasing activation by 28%\nBuilt and scaled a design system adopted by 6 product teams\nMentored 4 designers and introduced weekly design critiques',
    },
    {
      id: 'e2',
      jobTitle: 'Product Designer',
      company: 'BrightPath Analytics',
      location: 'Austin, TX',
      startDate: '2018-06',
      endDate: '2021-02',
      current: false,
      description:
        'Designed analytics dashboards used by 300+ enterprise clients\nRan 40+ usability studies that shaped the product roadmap\nPartnered with engineering to ship 18 features in 2 years',
    },
  ],
  education: [
    {
      id: 'ed1',
      degree: 'B.A. Interaction Design',
      institution: 'University of Texas at Austin',
      location: 'Austin, TX',
      startDate: '2014-08',
      endDate: '2018-05',
      current: false,
      gpa: '',
      description: '',
    },
  ],
  skills: [
    { id: 's1', name: 'Figma', level: 5 },
    { id: 's2', name: 'Design Systems', level: 5 },
    { id: 's3', name: 'User Research', level: 4 },
    { id: 's4', name: 'Prototyping', level: 5 },
    { id: 's5', name: 'Accessibility', level: 4 },
    { id: 's6', name: 'HTML & CSS', level: 3 },
  ],
  projects: [],
  certifications: [
    { id: 'c1', name: 'Google UX Design Certificate', issuer: 'Google', date: '2020-09', link: '' },
  ],
  languages: [
    { id: 'l1', name: 'English', proficiency: 'Native' },
    { id: 'l2', name: 'Spanish', proficiency: 'Professional' },
  ],
  awards: [],
  interests: [
    { id: 'i1', name: 'Photography' },
    { id: 'i2', name: 'Hiking' },
  ],
  customSections: [],
  sectionOrder: [...BUILT_IN_SECTIONS],
  hiddenSections: [],
  sectionTitles: {},
};
