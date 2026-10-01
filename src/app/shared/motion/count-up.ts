import { DestroyRef, Directive, effect, ElementRef, inject, input, signal, untracked } from '@angular/core';
import { easeOutExpo, observeVisibility, prefersReducedMotion } from './motion-utils';

/**
 * Counts a number up from zero when it scrolls into view (and animates later changes).
 * The host element's text is fully managed by the directive — leave it empty.
 *
 *   <b [appCountUp]="4608"></b>
 *   <b [appCountUp]="score" countSuffix="%" [countDuration]="1200"></b>
 */
@Directive({ selector: '[appCountUp]' })
export class CountUp {
  readonly appCountUp = input.required<number | null | undefined>();
  readonly countDuration = input(1800);
  readonly countDecimals = input(0);
  readonly countPrefix = input('');
  readonly countSuffix = input('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly visible = signal(false);
  private shown = 0;
  private frame = 0;

  constructor() {
    const stop = observeVisibility(
      this.el,
      (entry) => {
        if (!entry.isIntersecting) return;
        stop();
        this.visible.set(true);
      },
      { threshold: 0.3, rootMargin: '0px' },
    );

    effect(() => {
      const target = Number(this.appCountUp() ?? 0);
      const visible = this.visible();
      untracked(() => {
        if (!visible) {
          this.render(0);
          return;
        }
        this.animateTo(Number.isFinite(target) ? target : 0);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      stop();
      cancelAnimationFrame(this.frame);
    });
  }

  private animateTo(target: number): void {
    cancelAnimationFrame(this.frame);
    const from = this.shown;
    const duration = this.countDuration();
    if (prefersReducedMotion() || duration <= 0 || from === target) {
      this.render(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      this.render(from + (target - from) * easeOutExpo(progress));
      if (progress < 1) this.frame = requestAnimationFrame(step);
      else this.render(target);
    };
    this.frame = requestAnimationFrame(step);
  }

  private render(value: number): void {
    this.shown = value;
    const decimals = this.countDecimals();
    const text = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    this.el.textContent = `${this.countPrefix()}${text}${this.countSuffix()}`;
  }
}
