import { DestroyRef, Directive, ElementRef, inject, input, OnInit } from '@angular/core';
import { observeVisibility } from './motion-utils';

/**
 * Adds the class `is-inview` (permanently) the first time the element becomes visible,
 * so CSS can start animations inside it at the right moment:
 *
 *   <div class="gauge" appInView>…</div>
 *   .gauge.is-inview .arc { animation: draw 1.4s both; }
 */
@Directive({ selector: '[appInView]' })
export class InView implements OnInit {
  /** Fraction of the element that must be visible (0–1). */
  readonly appInView = input<number | string>('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private stop: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop?.());
  }

  ngOnInit(): void {
    const threshold = Number(this.appInView()) || 0.25;
    this.stop = observeVisibility(
      this.el,
      (entry) => {
        if (!entry.isIntersecting) return;
        this.stop?.();
        this.stop = null;
        this.el.classList.add('is-inview');
      },
      { threshold, rootMargin: '0px 0px -6% 0px' },
    );
  }
}
