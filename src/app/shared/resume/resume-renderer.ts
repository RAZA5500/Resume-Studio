import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';
import {
  bulletLines,
  dateRange,
  type DesignSettings,
  formatDate,
  type ResumeContent,
  SAMPLE_PHOTO,
  sectionTitle,
  TWO_COLUMN_LAYOUTS,
} from '../../core/models/resume.models';
import { isDark, mix } from '../../core/utils/colors';
import { fontStack } from '../../core/utils/fonts';
import { RESUME_CSS } from './resume-styles';

export const DEFAULT_DESIGN: DesignSettings = {
  layout: 'modern',
  primaryColor: '#1e3a8a',
  accentColor: '#3b82f6',
  textColor: '#1f2937',
  mutedColor: '#6b7280',
  backgroundColor: '#ffffff',
  sidebarColor: '#1e3a8a',
  sidebarTextColor: '#ffffff',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  fontSize: 10.5,
  lineHeight: 1.45,
  margin: 16,
  sectionGap: 14,
  headingStyle: 'bar',
  skillStyle: 'tags',
  bulletStyle: 'disc',
  headerAlign: 'left',
  showPhoto: false,
  photoShape: 'circle',
  showIcons: true,
  uppercaseHeadings: false,
  dateFormat: 'MMM YYYY',
  pageSize: 'A4',
  sidebarWidth: 32,
};

type Family = 'single' | 'band' | 'split' | 'sidebar' | 'banner' | 'creative';

const FAMILY: Record<string, Family> = {
  executive: 'band',
  split: 'split',
  corporate: 'split',
  sidebar: 'sidebar',
  'sidebar-right': 'sidebar',
  banner: 'banner',
  creative: 'creative',
};

const CENTER_LAYOUTS = new Set(['classic', 'elegant', 'academic']);
const ASIDE_SECTIONS = new Set(['skills', 'languages', 'certifications', 'interests']);

interface ContactItem {
  key: 'email' | 'phone' | 'location' | 'linkedin' | 'website' | 'github';
  value: string;
  href: string | null;
}

@Component({
  selector: 'app-resume-renderer',
  imports: [NgTemplateOutlet],
  templateUrl: './resume-renderer.html',
  styles: [RESUME_CSS],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumeRenderer {
  readonly content = input.required<ResumeContent>();
  readonly design = input.required<DesignSettings>();
  /** "preview" shows placeholders for empty fields, "thumb" is a static gallery preview. */
  readonly mode = input<'preview' | 'thumb' | 'export'>('preview');

  protected readonly d = computed<DesignSettings>(() => ({ ...DEFAULT_DESIGN, ...this.design() }));
  protected readonly c = computed(() => this.content());
  protected readonly family = computed<Family>(() => FAMILY[this.d().layout] ?? 'single');
  protected readonly twoColumn = computed(() => TWO_COLUMN_LAYOUTS.includes(this.d().layout));
  protected readonly placeholders = computed(() => this.mode() === 'preview');

  protected readonly rootClass = computed(() => {
    const d = this.d();
    const center = d.headerAlign === 'center' || (CENTER_LAYOUTS.has(d.layout) && d.headerAlign !== 'left');
    return [
      'rz',
      `rz-layout-${d.layout}`,
      `rz-hs-${d.headingStyle}`,
      `rz-bs-${d.bulletStyle}`,
      `rz-ps-${d.photoShape}`,
      `rz-mode-${this.mode()}`,
      d.uppercaseHeadings ? 'rz-upper' : '',
      d.showIcons ? '' : 'rz-noicons',
      center && !this.twoColumn() ? 'rz-center' : '',
      this.twoColumn() ? 'rz-two' : '',
      d.pageSize === 'Letter' ? 'rz-letter' : '',
    ]
      .filter(Boolean)
      .join(' ');
  });

  protected readonly cssVars = computed(() => {
    const d = this.d();
    const darkSide = isDark(d.sidebarColor);
    return {
      '--rz-primary': d.primaryColor,
      '--rz-accent': d.accentColor,
      '--rz-text': d.textColor,
      '--rz-muted': d.mutedColor,
      '--rz-bg': d.backgroundColor,
      '--rz-side-bg': d.sidebarColor,
      '--rz-side-text': d.sidebarTextColor,
      '--rz-side-head': darkSide ? d.sidebarTextColor : d.primaryColor,
      '--rz-side-accent': darkSide ? mix(d.accentColor, '#ffffff', 0.3) : d.accentColor,
      '--rz-hfont': fontStack(d.headingFont),
      '--rz-bfont': fontStack(d.bodyFont),
      '--rz-fs': `${d.fontSize}pt`,
      '--rz-lh': String(d.lineHeight),
      '--rz-m': `${d.margin}mm`,
      '--rz-gap': `${d.sectionGap}pt`,
      '--rz-side-w': `${d.sidebarWidth}%`,
    };
  });

  protected readonly name = computed(() => this.c().personal.fullName.trim());
  protected readonly jobTitle = computed(() => this.c().personal.jobTitle.trim());

  protected readonly photo = computed(() => {
    const d = this.d();
    const photo = this.c().personal.photo;
    if (!d.showPhoto) return null;
    if (photo) return { src: photo, placeholder: false };
    return this.mode() === 'export' ? null : { src: SAMPLE_PHOTO, placeholder: this.mode() === 'preview' };
  });

  protected readonly contacts = computed<ContactItem[]>(() => {
    const p = this.c().personal;
    const url = (value: string) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const items: ContactItem[] = [
      { key: 'email', value: p.email, href: p.email ? `mailto:${p.email}` : null },
      { key: 'phone', value: p.phone, href: p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : null },
      { key: 'location', value: p.location, href: null },
      { key: 'linkedin', value: p.linkedin, href: p.linkedin ? url(p.linkedin) : null },
      { key: 'website', value: p.website, href: p.website ? url(p.website) : null },
      { key: 'github', value: p.github, href: p.github ? url(p.github) : null },
    ];
    return items.filter((i) => i.value?.trim());
  });

  /** Visible sections that actually contain data, in the user's order. */
  protected readonly visibleKeys = computed(() => {
    const c = this.c();
    return c.sectionOrder.filter((key) => !c.hiddenSections.includes(key) && this.hasData(c, key));
  });

  protected readonly asideKeys = computed(() => this.visibleKeys().filter((k) => ASIDE_SECTIONS.has(k)));
  protected readonly mainKeys = computed(() =>
    this.twoColumn() ? this.visibleKeys().filter((k) => !ASIDE_SECTIONS.has(k)) : this.visibleKeys(),
  );

  /** Pre-computed view data so the template stays cheap. */
  protected readonly vm = computed(() => {
    const c = this.c();
    const fmt = this.d().dateFormat;
    return {
      experience: c.experience.map((e) => ({
        ...e,
        range: dateRange(e.startDate, e.endDate, e.current, fmt),
        lines: bulletLines(e.description),
      })),
      education: c.education.map((e) => ({
        ...e,
        range: dateRange(e.startDate, e.endDate, e.current, fmt),
        lines: bulletLines(e.description),
      })),
      projects: c.projects.map((p) => ({
        ...p,
        range: dateRange(p.startDate, p.endDate, false, fmt),
        lines: bulletLines(p.description),
      })),
      certifications: c.certifications.map((x) => ({ ...x, when: formatDate(x.date, fmt) })),
      awards: c.awards.map((x) => ({ ...x, when: formatDate(x.date, fmt) })),
      custom: new Map(
        c.customSections.map((s) => [
          `custom:${s.id}`,
          s.items.map((i) => ({ ...i, lines: bulletLines(i.description) })),
        ]),
      ),
    };
  });

  protected title(key: string): string {
    return sectionTitle(this.c(), key);
  }

  protected sectionType(key: string): string {
    return key.startsWith('custom:') ? 'custom' : key;
  }

  protected levelWidth(level: number): string {
    return `${(level || 4) * 20}%`;
  }

  protected dots(level: number): boolean[] {
    const value = level || 4;
    return [1, 2, 3, 4, 5].map((n) => n <= value);
  }

  private hasData(c: ResumeContent, key: string): boolean {
    switch (key) {
      case 'summary':
        return !!c.summary.trim();
      case 'experience':
        return c.experience.length > 0;
      case 'education':
        return c.education.length > 0;
      case 'skills':
        return c.skills.length > 0;
      case 'projects':
        return c.projects.length > 0;
      case 'certifications':
        return c.certifications.length > 0;
      case 'languages':
        return c.languages.length > 0;
      case 'awards':
        return c.awards.length > 0;
      case 'interests':
        return c.interests.length > 0;
      default:
        return !!c.customSections.find((s) => `custom:${s.id}` === key)?.items.length;
    }
  }
}
