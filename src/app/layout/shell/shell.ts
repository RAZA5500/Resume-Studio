import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { Magnetic } from '../../shared/motion/magnetic';
import { ClickOutside } from '../../shared/ui/click-outside';
import { Logo } from '../../shared/ui/logo';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

const COLLAPSED_KEY = 'rs_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo, ClickOutside, ThemeToggle, Magnetic],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'menuOpen.set(false)' },
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly billing = inject(BillingService);
  protected readonly menuOpen = signal(false);
  protected readonly userMenu = signal(false);
  /** Desktop only: icon-only sidebar. */
  protected readonly collapsed = signal(readCollapsed());
  private readonly desktop = signal(typeof matchMedia === 'function' ? matchMedia('(min-width: 961px)').matches : true);
  protected readonly compactLogo = computed(() => this.collapsed() && this.desktop());

  protected readonly nav = [
    { link: '/app/dashboard', icon: 'space_dashboard', label: 'Dashboard' },
    { link: '/app/templates', icon: 'grid_view', label: 'Templates' },
    { link: '/app/ats', icon: 'fact_check', label: 'ATS checker' },
    { link: '/app/documents', icon: 'description', label: 'PDF & documents' },
    { link: '/app/cover-letter', icon: 'mail', label: 'Cover letters' },
  ];

  protected readonly usage = computed(() => {
    const summary = this.billing.summary();
    if (!summary) return [];
    return (['resume', 'cover_letter', 'document'] as const).map((kind) => {
      const used = summary.used[kind];
      const limit = summary.limits[kind];
      return {
        kind,
        label: { resume: 'Resumes', cover_letter: 'Cover letters', document: 'Documents' }[kind],
        used,
        limit,
        full: limit >= 0 && used >= limit,
        percent: limit < 0 ? 0 : limit === 0 ? 100 : Math.min(100, (used / limit) * 100),
      };
    });
  });

  constructor() {
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(min-width: 961px)');
      const update = (event: MediaQueryListEvent) => this.desktop.set(event.matches);
      query.addEventListener('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
    }

    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.userMenu.set(false);
        this.billing.refresh();
      });
  }

  protected toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    this.userMenu.set(false);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // storage unavailable — the choice lasts for this visit only
    }
  }
}
