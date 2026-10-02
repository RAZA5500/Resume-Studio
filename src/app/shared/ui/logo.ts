import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  imports: [RouterLink],
  template: `
    <a class="logo" [routerLink]="link()" aria-label="ResumeStudio home">
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7 3.5h7.5L19 8v12.5H7z" /><path d="M14.5 3.5V8H19" /><path d="M10 12.5h6M10 16h4" /></svg>
        <span class="spark"></span>
      </span>
      @if (!compact()) {
        <span class="word">Resume<b>Studio</b></span>
      }
    </a>
  `,
  styles: `
    :host { display: inline-flex; }
    .logo { display: inline-flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; }
    .mark {
      position: relative; width: 34px; height: 34px; border-radius: 11px; flex-shrink: 0;
      display: grid; place-items: center; overflow: hidden;
      background: var(--grad-brand);
      box-shadow: 0 4px 12px -6px rgba(37, 99, 235, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transition: transform 0.55s var(--ease-spring);
    }
    .mark::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.6) 50%, transparent 70%);
      transform: translateX(-130%);
    }
    .logo:hover .mark { transform: rotate(-9deg) scale(1.07); }
    .logo:hover .mark::after { transform: translateX(130%); transition: transform 0.9s var(--ease-out); }
    .mark svg { position: relative; width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .spark {
      position: absolute; top: 5px; right: 5px; width: 4px; height: 4px; border-radius: 50%;
      background: #fff; opacity: 0.85;
    }
    .word { font-family: var(--font-display); font-size: 19px; font-weight: 700; letter-spacing: -0.035em; line-height: 1; }
    .word b {
      font-weight: 700; color: var(--primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  readonly link = input('/');
  /** Mark only, without the word (collapsed sidebar). */
  readonly compact = input(false);
}
