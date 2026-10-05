import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { type DesignSettings, SAMPLE_CONTENT } from '../../core/models/resume.models';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { PublicHeader } from '../../layout/public-header/public-header';
import { DEFAULT_DESIGN } from '../../shared/resume/resume-renderer';
import { ScaledResume } from '../../shared/resume/scaled-resume';
import { CountUp } from '../../shared/motion/count-up';
import { InView } from '../../shared/motion/in-view';
import { Magnetic } from '../../shared/motion/magnetic';
import { observeVisibility } from '../../shared/motion/motion-utils';
import { PointerFx } from '../../shared/motion/pointer-fx';
import { Reveal } from '../../shared/motion/reveal';
import { Tilt } from '../../shared/motion/tilt';
import { Typewriter } from '../../shared/motion/typewriter';
import { Logo } from '../../shared/ui/logo';
import { ScoreRing } from '../../shared/ui/score-ring';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

interface Showcase {
  name: string;
  design: DesignSettings;
}

function design(patch: Partial<DesignSettings>): DesignSettings {
  return { ...DEFAULT_DESIGN, ...patch };
}

/** Real layout × palette × font combinations from the catalog, rendered live in the marquee. */
const SHOWCASE: Showcase[] = [
  { name: 'Modern · Navy', design: design({ layout: 'modern', primaryColor: '#1e3a8a', accentColor: '#3b82f6', headingStyle: 'bar' }) },
  { name: 'Sidebar · Violet', design: design({ layout: 'sidebar', primaryColor: '#6d28d9', accentColor: '#a78bfa', sidebarColor: '#5b21b6', sidebarTextColor: '#ffffff', headingFont: 'Poppins', bodyFont: 'Inter', skillStyle: 'bars' }) },
  { name: 'Classic · Charcoal', design: design({ layout: 'classic', primaryColor: '#1f2937', accentColor: '#4b5563', headingStyle: 'line', uppercaseHeadings: true, headingFont: 'Merriweather', bodyFont: 'Source Sans 3', skillStyle: 'inline' }) },
  { name: 'Executive · Emerald', design: design({ layout: 'executive', primaryColor: '#047857', accentColor: '#10b981', headingFont: 'Montserrat', bodyFont: 'Source Sans 3', skillStyle: 'columns' }) },
  { name: 'Banner · Rose', design: design({ layout: 'banner', primaryColor: '#be185d', accentColor: '#f472b6', headingFont: 'Raleway', bodyFont: 'Nunito Sans', headingStyle: 'underline' }) },
  { name: 'Elegant · Mocha', design: design({ layout: 'elegant', primaryColor: '#78350f', accentColor: '#b08968', headingFont: 'Playfair Display', bodyFont: 'Lato', headingStyle: 'double' }) },
  { name: 'Tech · Ocean', design: design({ layout: 'tech', primaryColor: '#0e7490', accentColor: '#06b6d4', headingFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans' }) },
  { name: 'Creative · Coral', design: design({ layout: 'creative', primaryColor: '#c2410c', accentColor: '#fb923c', sidebarColor: '#9a3412', sidebarTextColor: '#ffffff', headingFont: 'Poppins', bodyFont: 'Inter', skillStyle: 'dots' }) },
  { name: 'Timeline · Teal', design: design({ layout: 'timeline', primaryColor: '#0f766e', accentColor: '#14b8a6', headingStyle: 'dot' }) },
  { name: 'Minimal · Slate', design: design({ layout: 'minimal', primaryColor: '#334155', accentColor: '#64748b', headingFont: 'Lora', bodyFont: 'Lora', skillStyle: 'list' }) },
  { name: 'Bold · Crimson', design: design({ layout: 'bold', primaryColor: '#b91c1c', accentColor: '#ef4444', headingFont: 'Poppins', bodyFont: 'Inter' }) },
  { name: 'Split · Indigo', design: design({ layout: 'split', primaryColor: '#4338ca', accentColor: '#818cf8', headingFont: 'Lato', bodyFont: 'Lato' }) },
];

const CAREERS_A = [
  { icon: 'code', label: 'Software engineers' },
  { icon: 'school', label: 'Teachers' },
  { icon: 'stethoscope', label: 'Doctors & nurses' },
  { icon: 'account_balance', label: 'Bankers & accountants' },
  { icon: 'campaign', label: 'Marketing' },
  { icon: 'engineering', label: 'Civil engineers' },
  { icon: 'flight_takeoff', label: 'Overseas jobs' },
  { icon: 'gavel', label: 'Lawyers' },
];

const CAREERS_B = [
  { icon: 'workspace_premium', label: 'Fresh graduates' },
  { icon: 'palette', label: 'Designers' },
  { icon: 'storefront', label: 'Sales & retail' },
  { icon: 'support_agent', label: 'Call centre' },
  { icon: 'local_shipping', label: 'Supply chain' },
  { icon: 'badge', label: 'Government jobs' },
  { icon: 'science', label: 'Researchers' },
  { icon: 'restaurant', label: 'Hospitality' },
];

@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    PublicHeader,
    ScaledResume,
    ScoreRing,
    Logo,
    ThemeToggle,
    Reveal,
    Tilt,
    PointerFx,
    Magnetic,
    CountUp,
    InView,
    Typewriter,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  protected readonly auth = inject(AuthService);
  protected readonly billing = inject(BillingService);
  private readonly document = inject(DOCUMENT);
  private readonly scrollBar = viewChild<ElementRef<HTMLElement>>('scrollBar');
  private readonly stepsList = viewChild<ElementRef<HTMLElement>>('stepsList');

  protected readonly sample = SAMPLE_CONTENT;
  protected readonly year = new Date().getFullYear();
  protected readonly startLink = computed(() => (this.auth.isAuthenticated() ? '/app/templates' : '/register'));
  protected readonly upgradeLink = computed(() => (this.auth.isAuthenticated() ? '/checkout' : '/register'));
  protected readonly openFaq = signal<number | null>(0);

  protected readonly heroDesign = design({
    layout: 'modern',
    primaryColor: '#1e3a8a',
    accentColor: '#2563eb',
    headingStyle: 'line',
    uppercaseHeadings: true,
    skillStyle: 'inline',
  });

  protected readonly roles = [
    'Software Engineer',
    'Teacher',
    'Accountant',
    'Doctor',
    'Fresh Graduate',
    'Sales Manager',
    'Civil Engineer',
    'Graphic Designer',
  ];

  /** Twice the list so the CSS marquee can loop seamlessly. */
  protected readonly careersA = [...CAREERS_A, ...CAREERS_A];
  protected readonly careersB = [...CAREERS_B, ...CAREERS_B];
  protected readonly showcase = [...SHOWCASE, ...SHOWCASE];

  /** Decorative twinkling stars in the hero (fixed positions so they never jump). */
  protected readonly stars = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 37 + 11) % 100,
    y: (i * 53 + 7) % 92,
    size: 1 + (i % 3),
    delay: (i * 0.37) % 4,
  }));

  protected readonly stats = computed(() => [
    { value: 4608, prefix: '', suffix: '', label: 'ready-made templates' },
    { value: 100, prefix: '', suffix: '-point', label: 'ATS analysis' },
    { value: 16, prefix: '', suffix: ' layouts', label: '24 palettes · 12 font pairs' },
    { value: this.billing.price(), prefix: 'PKR ', suffix: '', label: 'lifetime access, one-time' },
  ]);

  protected readonly steps = [
    { icon: 'grid_view', title: 'Pick a template', text: 'Choose an ATS-friendly design or import the resume you already have from PDF or Word.' },
    { icon: 'auto_awesome', title: 'Write with AI', text: 'Turn duties into achievements, generate a summary and preview every change live.' },
    { icon: 'download', title: 'Check & download', text: 'Run the ATS check against the job post, then download a PDF or Word file.' },
  ];

  protected readonly atsBars = [
    { label: 'Keywords', value: 84 },
    { label: 'Impact', value: 93 },
    { label: 'Parseability', value: 100 },
    { label: 'Sections', value: 100 },
    { label: 'Language', value: 80 },
  ];

  protected readonly editorTools = ['arrow_selector_tool', 'title', 'edit_note', 'draw', 'ink_highlighter', 'ink_eraser', 'signature'];

  protected readonly faqs = computed(() => {
    const ai = this.billing.config()?.aiLimits;
    const aiAnswer =
      ai && ai.free >= 0 && ai.lifetime >= 0
        ? `AI writing has a daily fair-use limit of ${ai.free} requests on Free and ${ai.lifetime} on Lifetime, which is plenty for building and tailoring several resumes. It resets at midnight.`
        : 'AI writing is included on every plan. A daily fair-use limit keeps the service fast for everyone and resets at midnight.';
    return [
      { q: 'What do I get on the free plan?', a: 'Every day you can create 1 new resume, write 1 cover letter and edit 1 document. All templates, the ATS checker and PDF/Word downloads are included (downloads carry a small ResumeStudio watermark). Limits reset at midnight Pakistan time.' },
      { q: 'What does Lifetime access include?', a: `One payment of PKR ${this.billing.price()} removes the daily limits for good: unlimited resumes, cover letters and document edits, and downloads without a watermark. There is no subscription and nothing to renew.` },
      { q: 'How do I pay?', a: 'Send the amount by JazzCash, Easypaisa or bank transfer, then submit your transaction ID on the Billing page. Your account is upgraded as soon as the payment is verified.' },
      { q: 'Is AI usage unlimited?', a: aiAnswer },
      { q: 'Are the templates ATS-friendly?', a: 'Single-column templates use real, selectable text in reading order with standard section headings — the format applicant tracking systems parse best. Two-column designs are clearly labelled.' },
      { q: 'Can I edit a PDF I already have?', a: 'Yes. Upload it to change existing text, cover content, add text, images, highlights and your signature, then export a PDF or images.' },
      { q: 'Is my data private?', a: 'Your resumes and documents are only visible to your account. You can delete them at any time.' },
    ];
  });

  constructor() {
    // Scroll-linked effects write styles straight onto the two elements that use them — no change
    // detection, and no CSS variable on the page root (that would restyle every element per frame).
    let frame = 0;
    let stepsNear = false;
    let stopSteps: (() => void) | null = null;
    const view = this.document.defaultView;
    const update = () => {
      frame = 0;
      if (!view) return;
      const root = this.document.documentElement;
      const max = root.scrollHeight - view.innerHeight;
      const bar = this.scrollBar()?.nativeElement;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, view.scrollY / max).toFixed(4) : 0})`;
      const list = this.stepsList()?.nativeElement;
      if (list && stepsNear) {
        const rect = list.getBoundingClientRect();
        const progress = (view.innerHeight * 0.7 - rect.top) / Math.max(1, rect.height);
        list.style.setProperty('--progress', Math.min(1, Math.max(0, progress)).toFixed(3));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    afterNextRender(() => {
      update();
      view?.addEventListener('scroll', onScroll, { passive: true });
      view?.addEventListener('resize', onScroll, { passive: true });
      const list = this.stepsList()?.nativeElement;
      if (list) {
        stopSteps = observeVisibility(
          list,
          (entry) => {
            stepsNear = entry.isIntersecting;
            if (stepsNear) onScroll();
          },
          { threshold: 0, rootMargin: '25% 0px' },
        );
      }
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(frame);
      stopSteps?.();
      view?.removeEventListener('scroll', onScroll);
      view?.removeEventListener('resize', onScroll);
    });
  }

  protected toggleFaq(index: number): void {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }
}
