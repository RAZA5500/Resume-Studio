import type {
  BulletStyle,
  DesignSettings,
  HeadingStyle,
  SkillStyle,
} from '../common/types/resume.types.js';

/**
 * The template catalog is generated combinatorially:
 *   16 layouts × 24 colour palettes × 12 font pairings = 4,608 templates.
 * Each combination also gets deterministic variations (heading, bullet and
 * skill styles, spacing) so thumbnails in the gallery look distinct.
 */
export const CATALOG_VERSION = 3;

export interface LayoutDef {
  key: string;
  name: string;
  description: string;
  columns: 1 | 2;
  ats: boolean;
  photo: boolean;
  categories: string[];
  headingStyles: HeadingStyle[];
  skillStyles: SkillStyle[];
  bulletStyles: BulletStyle[];
  headerAlign: 'left' | 'center';
  uppercase: boolean;
  icons: boolean;
  margins: number[];
  sidebar?: 'dark' | 'tint' | 'mixed';
}

export interface PaletteDef {
  key: string;
  name: string;
  family: string;
  primary: string;
  accent: string;
}

export interface FontDef {
  key: string;
  name: string;
  heading: string;
  body: string;
  style: 'sans' | 'serif';
}

const SAFE_BULLETS: BulletStyle[] = ['disc', 'dash', 'square'];

export const LAYOUTS: LayoutDef[] = [
  {
    key: 'classic',
    name: 'Classic',
    description: 'Timeless single-column layout with a centered header — the safest choice for any ATS.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['ats', 'professional', 'simple'],
    headingStyles: ['line', 'underline', 'plain'],
    skillStyles: ['inline', 'columns', 'list'],
    bulletStyles: SAFE_BULLETS,
    headerAlign: 'center',
    uppercase: true,
    icons: false,
    margins: [16, 18, 20],
  },
  {
    key: 'modern',
    name: 'Modern',
    description: 'Clean single column with colored name and accent headings for a contemporary look.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['modern', 'ats', 'professional'],
    headingStyles: ['bar', 'line', 'underline'],
    skillStyles: ['tags', 'columns', 'inline'],
    bulletStyles: ['disc', 'dash', 'square'],
    headerAlign: 'left',
    uppercase: false,
    icons: true,
    margins: [14, 16, 18],
  },
  {
    key: 'minimal',
    name: 'Minimal',
    description: 'Generous whitespace and quiet typography that lets your achievements speak.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['minimal', 'ats', 'simple'],
    headingStyles: ['plain', 'dot', 'underline'],
    skillStyles: ['inline', 'list'],
    bulletStyles: ['dash', 'disc', 'none'],
    headerAlign: 'left',
    uppercase: true,
    icons: false,
    margins: [18, 20, 22],
  },
  {
    key: 'executive',
    name: 'Executive',
    description: 'Bold full-width header band for senior leaders and managers.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['executive', 'professional', 'ats'],
    headingStyles: ['line', 'double', 'underline'],
    skillStyles: ['columns', 'inline'],
    bulletStyles: SAFE_BULLETS,
    headerAlign: 'left',
    uppercase: true,
    icons: true,
    margins: [16, 18],
  },
  {
    key: 'compact',
    name: 'Compact',
    description: 'Dense single-page layout that fits a lot of experience without clutter.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['ats', 'simple', 'professional'],
    headingStyles: ['line', 'plain', 'bar'],
    skillStyles: ['columns', 'inline'],
    bulletStyles: SAFE_BULLETS,
    headerAlign: 'left',
    uppercase: true,
    icons: false,
    margins: [11, 12, 14],
  },
  {
    key: 'elegant',
    name: 'Elegant',
    description: 'Refined centered design with graceful dividers — great with serif fonts.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['professional', 'executive', 'ats'],
    headingStyles: ['double', 'line', 'plain'],
    skillStyles: ['inline', 'columns'],
    bulletStyles: ['disc', 'dash'],
    headerAlign: 'center',
    uppercase: true,
    icons: false,
    margins: [18, 20],
  },
  {
    key: 'split',
    name: 'Split Header',
    description: 'Name on the left, contact details on the right, single-column body.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['modern', 'ats', 'professional'],
    headingStyles: ['bar', 'underline', 'line'],
    skillStyles: ['tags', 'inline', 'columns'],
    bulletStyles: SAFE_BULLETS,
    headerAlign: 'left',
    uppercase: false,
    icons: true,
    margins: [14, 16, 18],
  },
  {
    key: 'timeline',
    name: 'Timeline',
    description: 'Experience displayed on a vertical timeline to highlight career progression.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['modern', 'creative', 'ats'],
    headingStyles: ['dot', 'bar', 'line'],
    skillStyles: ['tags', 'bars'],
    bulletStyles: ['disc', 'dash', 'arrow'],
    headerAlign: 'left',
    uppercase: false,
    icons: true,
    margins: [14, 16, 18],
  },
  {
    key: 'tech',
    name: 'Tech',
    description: 'Developer-friendly layout with monospace accents and skill tags.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['tech', 'modern', 'ats'],
    headingStyles: ['boxed', 'bar', 'line'],
    skillStyles: ['tags', 'columns'],
    bulletStyles: ['arrow', 'dash', 'disc'],
    headerAlign: 'left',
    uppercase: false,
    icons: true,
    margins: [14, 16],
  },
  {
    key: 'academic',
    name: 'Academic CV',
    description: 'Traditional curriculum vitae style for research, teaching and academia.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['academic', 'ats', 'professional'],
    headingStyles: ['line', 'plain', 'double'],
    skillStyles: ['inline', 'list'],
    bulletStyles: ['disc', 'dash'],
    headerAlign: 'center',
    uppercase: false,
    icons: false,
    margins: [18, 20, 22],
  },
  {
    key: 'bold',
    name: 'Bold',
    description: 'Big confident typography and strong section markers that stand out.',
    columns: 1,
    ats: true,
    photo: false,
    categories: ['modern', 'creative'],
    headingStyles: ['boxed', 'bar'],
    skillStyles: ['tags', 'bars'],
    bulletStyles: ['square', 'arrow', 'disc'],
    headerAlign: 'left',
    uppercase: true,
    icons: true,
    margins: [14, 16],
  },
  {
    key: 'corporate',
    name: 'Corporate',
    description: 'Polished business layout with an accent rule and optional photo.',
    columns: 1,
    ats: true,
    photo: true,
    categories: ['professional', 'executive', 'photo'],
    headingStyles: ['underline', 'line', 'bar'],
    skillStyles: ['columns', 'tags'],
    bulletStyles: SAFE_BULLETS,
    headerAlign: 'left',
    uppercase: true,
    icons: true,
    margins: [14, 16, 18],
  },
  {
    key: 'sidebar',
    name: 'Sidebar',
    description: 'Colored left sidebar for contact, skills and languages with a photo.',
    columns: 2,
    ats: false,
    photo: true,
    categories: ['creative', 'modern', 'two-column', 'photo'],
    headingStyles: ['line', 'plain', 'underline'],
    skillStyles: ['bars', 'dots', 'tags'],
    bulletStyles: ['disc', 'dash', 'square'],
    headerAlign: 'left',
    uppercase: true,
    icons: true,
    margins: [12, 14],
    sidebar: 'mixed',
  },
  {
    key: 'sidebar-right',
    name: 'Right Sidebar',
    description: 'Main story on the left, quick facts in a soft right sidebar.',
    columns: 2,
    ats: false,
    photo: true,
    categories: ['creative', 'two-column', 'modern'],
    headingStyles: ['bar', 'line'],
    skillStyles: ['bars', 'tags', 'dots'],
    bulletStyles: ['disc', 'dash'],
    headerAlign: 'left',
    uppercase: false,
    icons: true,
    margins: [12, 14],
    sidebar: 'tint',
  },
  {
    key: 'banner',
    name: 'Banner',
    description: 'Eye-catching header banner with photo and a two-column body.',
    columns: 2,
    ats: false,
    photo: true,
    categories: ['creative', 'modern', 'two-column', 'photo'],
    headingStyles: ['line', 'bar'],
    skillStyles: ['dots', 'bars', 'tags'],
    bulletStyles: ['disc', 'square'],
    headerAlign: 'left',
    uppercase: true,
    icons: true,
    margins: [12, 14],
    sidebar: 'tint',
  },
  {
    key: 'creative',
    name: 'Creative',
    description: 'Expressive design with a bold sidebar — ideal for design and marketing roles.',
    columns: 2,
    ats: false,
    photo: true,
    categories: ['creative', 'two-column', 'photo'],
    headingStyles: ['boxed', 'bar', 'dot'],
    skillStyles: ['bars', 'dots'],
    bulletStyles: ['arrow', 'disc', 'check'],
    headerAlign: 'left',
    uppercase: true,
    icons: true,
    margins: [12, 14],
    sidebar: 'dark',
  },
];

export const PALETTES: PaletteDef[] = [
  { key: 'navy', name: 'Navy', family: 'blue', primary: '#1e3a8a', accent: '#3b82f6' },
  { key: 'royal', name: 'Royal', family: 'blue', primary: '#1d4ed8', accent: '#60a5fa' },
  { key: 'ocean', name: 'Ocean', family: 'blue', primary: '#0e7490', accent: '#06b6d4' },
  { key: 'sky', name: 'Sky', family: 'blue', primary: '#0369a1', accent: '#38bdf8' },
  { key: 'indigo', name: 'Indigo', family: 'purple', primary: '#4338ca', accent: '#818cf8' },
  { key: 'violet', name: 'Violet', family: 'purple', primary: '#6d28d9', accent: '#a78bfa' },
  { key: 'plum', name: 'Plum', family: 'purple', primary: '#6b21a8', accent: '#c084fc' },
  { key: 'emerald', name: 'Emerald', family: 'green', primary: '#047857', accent: '#10b981' },
  { key: 'forest', name: 'Forest', family: 'green', primary: '#166534', accent: '#4ade80' },
  { key: 'sage', name: 'Sage', family: 'green', primary: '#4d7c5f', accent: '#84a98c' },
  { key: 'teal', name: 'Teal', family: 'teal', primary: '#0f766e', accent: '#14b8a6' },
  { key: 'mint', name: 'Mint', family: 'teal', primary: '#0d9488', accent: '#5eead4' },
  { key: 'crimson', name: 'Crimson', family: 'red', primary: '#b91c1c', accent: '#ef4444' },
  { key: 'burgundy', name: 'Burgundy', family: 'red', primary: '#881337', accent: '#e11d48' },
  { key: 'rose', name: 'Rose', family: 'pink', primary: '#be185d', accent: '#f472b6' },
  { key: 'coral', name: 'Coral', family: 'orange', primary: '#c2410c', accent: '#fb923c' },
  { key: 'amber', name: 'Amber', family: 'orange', primary: '#b45309', accent: '#f59e0b' },
  { key: 'gold', name: 'Gold', family: 'yellow', primary: '#a16207', accent: '#eab308' },
  { key: 'mocha', name: 'Mocha', family: 'brown', primary: '#78350f', accent: '#b08968' },
  { key: 'espresso', name: 'Espresso', family: 'brown', primary: '#44291a', accent: '#a47148' },
  { key: 'charcoal', name: 'Charcoal', family: 'black', primary: '#1f2937', accent: '#4b5563' },
  { key: 'onyx', name: 'Onyx', family: 'black', primary: '#111111', accent: '#525252' },
  { key: 'slate', name: 'Slate', family: 'gray', primary: '#334155', accent: '#64748b' },
  { key: 'graphite', name: 'Graphite', family: 'gray', primary: '#3f3f46', accent: '#a1a1aa' },
];

export const FONTS: FontDef[] = [
  { key: 'inter', name: 'Inter', heading: 'Inter', body: 'Inter', style: 'sans' },
  { key: 'roboto', name: 'Roboto', heading: 'Roboto', body: 'Roboto', style: 'sans' },
  { key: 'lato', name: 'Lato', heading: 'Lato', body: 'Lato', style: 'sans' },
  { key: 'open-sans', name: 'Open Sans', heading: 'Open Sans', body: 'Open Sans', style: 'sans' },
  { key: 'montserrat', name: 'Montserrat', heading: 'Montserrat', body: 'Source Sans 3', style: 'sans' },
  { key: 'poppins', name: 'Poppins', heading: 'Poppins', body: 'Inter', style: 'sans' },
  { key: 'raleway', name: 'Raleway', heading: 'Raleway', body: 'Nunito Sans', style: 'sans' },
  { key: 'ibm-plex', name: 'IBM Plex', heading: 'IBM Plex Sans', body: 'IBM Plex Sans', style: 'sans' },
  { key: 'merriweather', name: 'Merriweather', heading: 'Merriweather', body: 'Source Sans 3', style: 'serif' },
  { key: 'playfair', name: 'Playfair', heading: 'Playfair Display', body: 'Lato', style: 'serif' },
  { key: 'lora', name: 'Lora', heading: 'Lora', body: 'Lora', style: 'serif' },
  { key: 'garamond', name: 'Garamond', heading: 'EB Garamond', body: 'EB Garamond', style: 'serif' },
];

export const CATEGORY_LABELS: Record<string, string> = {
  ats: 'ATS-Friendly',
  professional: 'Professional',
  modern: 'Modern',
  creative: 'Creative',
  executive: 'Executive',
  minimal: 'Minimal',
  simple: 'Simple',
  academic: 'Academic',
  tech: 'Tech & IT',
  'two-column': 'Two Column',
  photo: 'With Photo',
};

export interface GeneratedTemplate {
  id: string;
  name: string;
  description: string;
  layout: string;
  category: string;
  tags: string[];
  atsFriendly: boolean;
  columns: number;
  hasPhoto: boolean;
  paletteKey: string;
  colorFamily: string;
  fontKey: string;
  popularity: number;
  featured: boolean;
  catalogVersion: number;
  config: DesignSettings;
}

/** FNV-1a string hash — deterministic seed per template. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG so every generation run produces identical templates. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length) % list.length];

/** Mixes a hex colour with white; weight = share of the original colour (0..1). */
export function tint(hex: string, weight: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    return Math.round(c * weight + 255 * (1 - weight))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

const POPULAR_PALETTES = new Set(['navy', 'charcoal', 'slate', 'royal', 'emerald', 'onyx', 'teal']);

export function buildDesign(layout: LayoutDef, palette: PaletteDef, font: FontDef, seed: string): DesignSettings {
  const rnd = mulberry32(hash(seed));
  const darkText = palette.family === 'black' ? '#111827' : '#1f2937';
  const sidebarMode = layout.sidebar === 'mixed' ? (rnd() < 0.65 ? 'dark' : 'tint') : layout.sidebar;
  const darkSidebar = sidebarMode === 'dark';

  return {
    layout: layout.key,
    primaryColor: palette.primary,
    accentColor: palette.accent,
    textColor: darkText,
    mutedColor: '#6b7280',
    backgroundColor: '#ffffff',
    sidebarColor: darkSidebar ? palette.primary : tint(palette.primary, 0.08),
    sidebarTextColor: darkSidebar ? '#ffffff' : darkText,
    headingFont: font.heading,
    bodyFont: font.body,
    fontSize: pick(rnd, layout.key === 'compact' ? [9.5, 10] : font.style === 'serif' ? [10.5, 11] : [10, 10.5, 11]),
    lineHeight: pick(rnd, layout.key === 'compact' ? [1.3, 1.35] : [1.4, 1.45, 1.5]),
    margin: pick(rnd, layout.margins),
    sectionGap: pick(rnd, layout.key === 'compact' ? [8, 10] : [12, 14, 16]),
    headingStyle: pick(rnd, layout.headingStyles),
    skillStyle: pick(rnd, layout.skillStyles),
    bulletStyle: pick(rnd, layout.bulletStyles),
    headerAlign: layout.headerAlign,
    showPhoto: layout.photo,
    photoShape: pick(rnd, ['circle', 'circle', 'rounded', 'square'] as const),
    showIcons: layout.icons,
    uppercaseHeadings: layout.uppercase,
    dateFormat: pick(rnd, ['MMM YYYY', 'MMM YYYY', 'MM/YYYY', 'MMMM YYYY'] as const),
    pageSize: 'A4',
    sidebarWidth: layout.columns === 2 ? pick(rnd, [31, 33, 35]) : 32,
  };
}

let cache: GeneratedTemplate[] | null = null;

export function generateTemplates(): GeneratedTemplate[] {
  if (cache) return cache;
  const templates: GeneratedTemplate[] = [];

  LAYOUTS.forEach((layout) => {
    PALETTES.forEach((palette) => {
      FONTS.forEach((font, fontIndex) => {
        const id = `${layout.key}-${palette.key}-${font.key}`;
        const rnd = mulberry32(hash(`${id}#popularity`));
        const popularity = Math.round(
          rnd() * 600 +
            (layout.ats ? 180 : 60) +
            (POPULAR_PALETTES.has(palette.key) ? 160 : 0) +
            (fontIndex < 4 ? 90 : 0),
        );
        const tags = new Set<string>([
          ...layout.categories,
          palette.family,
          font.style,
          layout.columns === 2 ? 'two-column' : 'one-column',
        ]);
        if (layout.ats) tags.add('ats');
        if (layout.photo) tags.add('photo');

        templates.push({
          id,
          name: `${palette.name} ${layout.name}${fontIndex === 0 ? '' : ` · ${font.name}`}`,
          description: `${layout.description} ${palette.name} colors with ${font.heading}${
            font.heading === font.body ? '' : ` & ${font.body}`
          } typography.`,
          layout: layout.key,
          category: layout.categories[0],
          tags: [...tags],
          atsFriendly: layout.ats,
          columns: layout.columns,
          hasPhoto: layout.photo,
          paletteKey: palette.key,
          colorFamily: palette.family,
          fontKey: font.key,
          popularity,
          featured: popularity >= 960,
          catalogVersion: CATALOG_VERSION,
          config: buildDesign(layout, palette, font, id),
        });
      });
    });
  });

  cache = templates;
  return templates;
}

export const DEFAULT_TEMPLATE_ID = 'modern-navy-inter';
