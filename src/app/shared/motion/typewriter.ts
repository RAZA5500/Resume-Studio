import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { observeVisibility, prefersReducedMotion } from './motion-utils';

/**
 * Types a list of words one after another, deleting each before the next.
 * Purely decorative — give screen readers the full sentence separately.
 *
 *   <app-typewriter [words]="['Engineer', 'Teacher', 'Designer']" />
 */
@Component({
  selector: 'app-typewriter',
  template: `<span class="tw-text">{{ text() }}</span><span class="tw-caret"></span>`,
  styles: `
    :host { display: inline; white-space: nowrap; }
    .tw-caret {
      display: inline-block;
      width: 0.07em;
      min-width: 2px;
      height: 0.95em;
      margin-left: 0.06em;
      vertical-align: -0.08em;
      border-radius: 2px;
      background: var(--primary);
      animation: caret-blink 1s steps(1) infinite;
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Typewriter {
  readonly words = input.required<string[]>();
  readonly typeSpeed = input(70);
  readonly deleteSpeed = input(38);
  readonly hold = input(1900);

  protected readonly text = signal('');
  private timer = 0;
  private visible = true;
  /** Where typing stopped while scrolled out of view (resumed when it comes back). */
  private paused: [number, number, boolean] | null = null;

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const stop = observeVisibility(
      el,
      (entry) => {
        this.visible = entry.isIntersecting;
        if (this.visible && this.paused) {
          const [wordIndex, chars, deleting] = this.paused;
          this.paused = null;
          this.step(wordIndex, chars, deleting);
        }
      },
      { threshold: 0, rootMargin: '0px' },
    );
    afterNextRender(() => this.step(0, 0, false));
    inject(DestroyRef).onDestroy(() => {
      stop();
      clearTimeout(this.timer);
    });
  }

  private step(wordIndex: number, chars: number, deleting: boolean): void {
    const words = this.words();
    if (!words.length) return;
    if (!this.visible) {
      this.paused = [wordIndex, chars, deleting];
      return;
    }
    const word = words[wordIndex % words.length];

    if (prefersReducedMotion()) {
      this.text.set(word);
      this.timer = window.setTimeout(() => this.step(wordIndex + 1, 0, false), this.hold() * 1.4);
      return;
    }

    if (!deleting) {
      const next = chars + 1;
      this.text.set(word.slice(0, next));
      this.timer =
        next >= word.length
          ? window.setTimeout(() => this.step(wordIndex, next, true), this.hold())
          : window.setTimeout(() => this.step(wordIndex, next, false), this.typeSpeed() + Math.random() * 45);
      return;
    }

    const next = chars - 1;
    this.text.set(word.slice(0, Math.max(0, next)));
    this.timer =
      next <= 0
        ? window.setTimeout(() => this.step(wordIndex + 1, 0, false), 320)
        : window.setTimeout(() => this.step(wordIndex, next, true), this.deleteSpeed());
  }
}
