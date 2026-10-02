/**
 * Shared resume data model. The Angular app keeps an identical copy in
 * src/app/core/models/resume.models.ts (project root) — keep both in sync.
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
  /** Data URL of the profile photo, or empty string. */
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
  /** One bullet point per line. */
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
  /** 0 = not rated, 1-5 = proficiency. */
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
  /** Keys of built-in sections plus `custom:<id>` entries. */
  sectionOrder: string[];
  hiddenSections: string[];
  sectionTitles: Record<string, string>;
}

export type HeadingStyle = 'line' | 'underline' | 'bar' | 'plain' | 'boxed' | 'dot' | 'double';
export type SkillStyle = 'tags' | 'bars' | 'dots' | 'list' | 'columns' | 'inline';
export type BulletStyle = 'disc' | 'dash' | 'arrow' | 'square' | 'check' | 'none';

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
  /** Base font size in pt. */
  fontSize: number;
  lineHeight: number;
  /** Page margin in mm. */
  margin: number;
  /** Space between sections in pt. */
  sectionGap: number;
  headingStyle: HeadingStyle;
  skillStyle: SkillStyle;
  bulletStyle: BulletStyle;
  headerAlign: 'left' | 'center';
  showPhoto: boolean;
  photoShape: 'circle' | 'rounded' | 'square';
  showIcons: boolean;
  uppercaseHeadings: boolean;
  dateFormat: 'MMM YYYY' | 'MMMM YYYY' | 'MM/YYYY' | 'YYYY';
  pageSize: 'A4' | 'Letter';
  /** Sidebar width (percent) for two-column layouts. */
  sidebarWidth: number;
}

export const BUILT_IN_SECTIONS = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'awards',
  'interests',
] as const;

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
