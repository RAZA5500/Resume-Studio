import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { hasFinePointer, prefersReducedMotion } from './motion-utils';

/**
 * Makes an element lean towards the cursor and spring back when it leaves.
 * Uses the individual `translate` property so it composes with transforms.
 *
 *   <a class="btn btn-primary" appMagnetic>…</a>
 *   <a [appMagnetic]="0.45">…</a>
 */
@Directive({
  selector: '[appMagnetic]',
  host: {
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'reset()',
  },
})
export class Magnetic {
  /** Pull strength from 0 to 1 (default 0.3). */
  readonly appMagnetic = input<number | string>('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly enabled = hasFinePointer() && !prefersReducedMotion();
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  protected onMove(event: PointerEvent): void {
    if (!this.enabled || event.pointerType !== 'mouse') return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const rect = this.el.getBoundingClientRect();
      const strength = Number(this.appMagnetic()) || 0.3;
      const dx = (clientX - (rect.left + rect.width / 2)) * strength;
      const dy = (clientY - (rect.top + rect.height / 2)) * strength;
      this.el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
    });
  }

  protected reset(): void {
    cancelAnimationFrame(this.frame);
    this.el.style.translate = '';
  }
}
