import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * ResumeStudio logo: an "R" on a page with a folded corner, plus the word mark. The mark is inline
 * SVG (no image request, sharp at any size); its source of truth is scripts/app-icons.mjs, which
 * also generates the favicon and app icons from it.
 */
@Component({
  selector: 'app-logo',
  imports: [RouterLink],
  template: `
    <a class="logo" [routerLink]="link()" aria-label="ResumeStudio home">
      <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6.5 0H22.5L32 9.5V25.5A6.5 6.5 0 0 1 25.5 32H6.5A6.5 6.5 0 0 1 0 25.5V6.5A6.5 6.5 0 0 1 6.5 0Z" fill="#2563EB" />
        <path d="M22.5 0V7.5A2 2 0 0 0 24.5 9.5H32Z" fill="#BFD4FF" />
        <path d="M10.5 24.5V8.5H16.2A4.4 4.4 0 0 1 16.2 17.3H10.5M15.8 17.3L21.3 24.5" fill="none" stroke="#fff"
          stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      @if (!compact()) {
        <span class="word">Resume<b>Studio</b></span>
      }
    </a>
  `,
  styles: `
    :host { display: inline-flex; }
    .logo { display: inline-flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; }
    .mark { width: 34px; height: 34px; flex-shrink: 0; transition: transform 0.45s var(--ease-spring); }
    .logo:hover .mark { transform: rotate(-6deg) scale(1.06); }
    .word { font-family: var(--font-display); font-size: 19px; font-weight: 700; letter-spacing: -0.035em; line-height: 1; }
    .word b { font-weight: 700; color: var(--primary); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  readonly link = input('/');
  /** Mark only, without the word (collapsed sidebar). */
  readonly compact = input(false);
}
