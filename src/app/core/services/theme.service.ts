import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'rs_theme';
const THEME_COLORS: Record<Theme, string> = { dark: '#0a0c10', light: '#f7f8fa' };

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}

/**
 * Light / dark theme. The attribute is applied before the first paint by an inline
 * script in index.html; this service keeps it in sync and animates the switch with a
 * circular reveal (View Transitions API) that grows from the clicked toggle.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<Theme>(this.initialTheme());

  constructor() {
    this.apply(this.theme());
  }

  toggle(event?: MouseEvent): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark', event);
  }

  set(theme: Theme, event?: MouseEvent): void {
    if (theme === this.theme()) return;
    const update = () => {
      this.theme.set(theme);
      this.apply(theme);
    };

    const doc = this.document as Document & { startViewTransition?: (cb: () => void) => ViewTransitionLike };
    const view = this.document.defaultView;
    const reduceMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!doc.startViewTransition || !view || reduceMotion) {
      update();
      return;
    }

    const x = event?.clientX ?? view.innerWidth - 40;
    const y = event?.clientY ?? 40;
    const radius = Math.hypot(Math.max(x, view.innerWidth - x), Math.max(y, view.innerHeight - y));
    const root = this.document.documentElement;
    root.classList.add('theme-vt');

    const transition = doc.startViewTransition(update);
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => undefined);
    const cleanup = () => root.classList.remove('theme-vt');
    transition.finished.then(cleanup, cleanup);
  }

  private apply(theme: Theme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // storage unavailable (private mode) — the theme still applies for this visit
    }
  }

  private initialTheme(): Theme {
    const current = this.document.documentElement.getAttribute('data-theme');
    if (current === 'light' || current === 'dark') return current;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  }
}
