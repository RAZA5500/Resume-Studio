import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';

/** Sun / moon button that switches the theme with a circular reveal. */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <button type="button" class="tt" [class.is-light]="isLight()" [class.with-label]="showLabel()"
      (click)="theme.toggle($event)" [attr.aria-label]="label()" [title]="label()">
      <span class="icons" aria-hidden="true">
        <span class="i moon">dark_mode</span>
        <span class="i sun">light_mode</span>
      </span>
      @if (showLabel()) {
        <span class="text">{{ isLight() ? 'Light' : 'Dark' }} mode</span>
      }
    </button>
  `,
  styles: `
    :host { display: inline-flex; }
    .tt {
      position: relative; display: inline-flex; align-items: center; gap: 8px;
      height: 36px; min-width: 36px; padding: 0 9px; border-radius: 11px;
      border: 1px solid var(--border); background: var(--input-bg); color: var(--text-2);
      cursor: pointer; overflow: hidden;
      transition: color .2s var(--ease), border-color .2s var(--ease), background .2s var(--ease), transform .25s var(--ease-spring);
    }
    .tt:hover { color: var(--text); border-color: var(--primary-100); background: var(--primary-50); }
    .tt:active { transform: scale(.92); }
    .icons { position: relative; width: 18px; height: 18px; flex-shrink: 0; }
    .icons .i { position: absolute; inset: 0; font-size: 18px; transition: transform .6s var(--ease-spring), opacity .35s var(--ease); }
    .sun { opacity: 0; transform: rotate(-120deg) scale(.4); color: var(--amber); }
    .moon { color: #c4b5fd; }
    .is-light .sun { opacity: 1; transform: none; }
    .is-light .moon { opacity: 0; transform: rotate(120deg) scale(.4); }
    .with-label { width: 100%; padding: 0 11px; }
    .text { font-size: 13px; font-weight: 600; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
  readonly showLabel = input(false);
  protected readonly isLight = computed(() => this.theme.theme() === 'light');
  protected readonly label = computed(() => (this.isLight() ? 'Switch to dark mode' : 'Switch to light mode'));
}
