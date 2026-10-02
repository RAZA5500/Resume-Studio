import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { Magnetic } from '../../shared/motion/magnetic';
import { Logo } from '../../shared/ui/logo';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

interface NavLink {
  label: string;
  link: string;
  fragment?: string;
}

@Component({
  selector: 'app-public-header',
  imports: [RouterLink, RouterLinkActive, Logo, ThemeToggle, Magnetic],
  template: `
    <header class="bar" [class.scrolled]="scrolled()" [class.away]="away() && !open()" [class.menu-open]="open()">
      <div class="inner">
        <app-logo />
        <nav class="links" (pointerleave)="pill.set(null)" aria-label="Main">
          <span class="pill" [class.on]="pill()" [style.--x]="(pill()?.x ?? 0) + 'px'" [style.--w]="(pill()?.w ?? 0) + 'px'" aria-hidden="true"></span>
          @for (l of links; track l.label) {
            <!-- Section links share the "/" path, so only real pages get an active state. -->
            <a [routerLink]="l.link" [fragment]="l.fragment" [routerLinkActive]="l.fragment ? '' : 'active'" [routerLinkActiveOptions]="{ exact: true }"
              (pointerenter)="hover($event)">{{ l.label }}</a>
          }
        </nav>
        <div class="actions">
          <app-theme-toggle />
          @if (auth.isAuthenticated()) {
            <a class="btn btn-primary btn-sm btn-pill cta" routerLink="/app/dashboard" appMagnetic>Dashboard <span class="i">arrow_forward</span></a>
          } @else {
            <a class="btn btn-ghost btn-sm login" routerLink="/login">Log in</a>
            <a class="btn btn-primary btn-sm btn-pill cta" routerLink="/register" appMagnetic>Get started <span class="i">arrow_forward</span></a>
          }
          <button class="burger" type="button" (click)="open.set(!open())" [attr.aria-expanded]="open()" aria-label="Menu">
            <span></span><span></span>
          </button>
        </div>
      </div>
    </header>

    @if (open()) {
      <div class="mobile" animate.leave="is-leaving">
        <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
        <nav aria-label="Mobile">
          @for (l of links; track l.label; let i = $index) {
            <a [routerLink]="l.link" [fragment]="l.fragment" [style.--i]="i" (click)="open.set(false)">
              {{ l.label }} <span class="i">arrow_outward</span>
            </a>
          }
        </nav>
        <div class="mobile-cta" [style.--i]="links.length">
          @if (auth.isAuthenticated()) {
            <a class="btn btn-primary btn-lg btn-block" routerLink="/app/dashboard">Go to dashboard</a>
          } @else {
            <a class="btn btn-primary btn-lg btn-block" routerLink="/register">Create free resume</a>
            <a class="btn btn-glass btn-lg btn-block" routerLink="/login">Log in</a>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; height: 84px; }
    :host(.overlay) { height: 0; }
    .bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 120;
      padding: 14px 16px 0; pointer-events: none;
      transition: transform 0.5s var(--ease-out);
    }
    .bar.away { transform: translateY(-120%); }
    .inner {
      pointer-events: auto; position: relative;
      max-width: 1180px; margin: 0 auto; height: 60px; padding: 0 10px 0 16px;
      display: flex; align-items: center; gap: 24px;
      border-radius: 20px; border: 1px solid transparent;
      transition: background 0.4s var(--ease), border-color 0.4s var(--ease), box-shadow 0.4s var(--ease), max-width 0.5s var(--ease-out);
      animation: bar-in 0.9s var(--ease-out) both;
    }
    .scrolled .inner, .menu-open .inner {
      background: var(--surface-glass); border-color: var(--border);
      backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
      box-shadow: var(--shadow);
      max-width: 1120px;
    }
    .links { position: relative; display: flex; gap: 2px; flex: 1; justify-content: center; }
    .links a {
      position: relative; z-index: 1; padding: 8px 14px; border-radius: 12px;
      color: var(--text-2); font-weight: 600; font-size: 14px; transition: color 0.2s var(--ease);
    }
    .links a:hover, .links a.active { color: var(--text); }
    .pill {
      position: absolute; top: 0; left: 0; height: 100%; width: var(--w); border-radius: 12px;
      background: var(--primary-50); border: 1px solid var(--primary-100);
      transform: translateX(var(--x)); opacity: 0;
      transition: transform 0.45s var(--ease-out), width 0.45s var(--ease-out), opacity 0.25s var(--ease);
    }
    .pill.on { opacity: 1; }
    .actions { display: flex; gap: 8px; align-items: center; }
    .cta { box-shadow: 0 10px 30px -10px rgba(37, 99, 235, 0.8); }
    .burger {
      display: none; position: relative; width: 40px; height: 40px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--input-bg); cursor: pointer;
    }
    .burger span {
      position: absolute; left: 11px; right: 11px; height: 2px; border-radius: 2px; background: var(--text);
      transition: transform 0.45s var(--ease-spring), top 0.3s var(--ease);
    }
    .burger span:first-child { top: 15px; }
    .burger span:last-child { top: 23px; }
    .menu-open .burger span:first-child { top: 19px; transform: rotate(45deg); }
    .menu-open .burger span:last-child { top: 19px; transform: rotate(-45deg); }

    .mobile {
      position: fixed; inset: 0; z-index: 110; overflow: hidden auto;
      padding: 100px 24px 32px; display: flex; flex-direction: column; gap: 28px;
      background: var(--bg);
      animation: sheet-in 0.5s var(--ease-out) both;
    }
    .mobile.is-leaving { animation: sheet-out 0.3s var(--ease) both; }
    .mobile nav { position: relative; display: flex; flex-direction: column; }
    .mobile nav a {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 4px; border-bottom: 1px solid var(--border);
      font-family: var(--font-display); font-size: 30px; font-weight: 700; letter-spacing: -0.03em; color: var(--text);
      animation: link-in 0.6s var(--ease-out) both; animation-delay: calc(var(--i) * 60ms + 120ms);
    }
    .mobile nav a .i { font-size: 26px; color: var(--primary-700); }
    .mobile-cta {
      position: relative; display: flex; flex-direction: column; gap: 10px; margin-top: auto;
      animation: link-in 0.6s var(--ease-out) both; animation-delay: calc(var(--i) * 60ms + 160ms);
    }

    @keyframes bar-in { from { opacity: 0; transform: translateY(-24px); } }
    @keyframes sheet-in { from { opacity: 0; clip-path: circle(0% at calc(100% - 44px) 44px); } to { clip-path: circle(150% at calc(100% - 44px) 44px); } }
    @keyframes sheet-out { to { opacity: 0; } }
    @keyframes link-in { from { opacity: 0; transform: translateY(24px); } }

    @media (max-width: 900px) {
      .links { display: none; }
      .burger { display: inline-block; }
      .inner { justify-content: space-between; }
    }
    @media (max-width: 560px) {
      .login, .cta { display: none; }
    }
  `,
  host: {
    '[class.overlay]': 'overlay()',
    '(window:scroll)': 'onScroll()',
    '(document:keydown.escape)': 'open.set(false)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicHeader {
  protected readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  /** Overlay mode: the header floats over the page (landing hero) instead of reserving space. */
  readonly overlay = input(false);

  protected readonly open = signal(false);
  protected readonly scrolled = signal(false);
  protected readonly away = signal(false);
  protected readonly pill = signal<{ x: number; w: number } | null>(null);
  private lastY = 0;

  protected readonly links: NavLink[] = [
    { label: 'Templates', link: '/templates' },
    { label: 'Features', link: '/', fragment: 'features' },
    { label: 'ATS checker', link: '/', fragment: 'ats' },
    { label: 'Pricing', link: '/', fragment: 'pricing' },
    { label: 'FAQ', link: '/', fragment: 'faq' },
  ];

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));

    // Lock page scrolling while the mobile menu covers the screen.
    effect((onCleanup) => {
      if (!this.open()) return;
      const body = this.document.body;
      body.style.overflow = 'hidden';
      onCleanup(() => (body.style.overflow = ''));
    });
  }

  protected onScroll(): void {
    const y = this.document.defaultView?.scrollY ?? 0;
    const scrolled = y > 12;
    if (scrolled !== this.scrolled()) this.scrolled.set(scrolled);
    // Hide while scrolling down, show again as soon as the visitor scrolls up.
    if (y > this.lastY + 8 && y > 160) {
      if (!this.away()) this.away.set(true);
    } else if (y < this.lastY - 8 || y <= 160) {
      if (this.away()) this.away.set(false);
    }
    this.lastY = y;
  }

  protected hover(event: PointerEvent): void {
    const link = event.currentTarget as HTMLElement;
    this.pill.set({ x: link.offsetLeft, w: link.offsetWidth });
  }
}
