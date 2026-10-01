import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { hasFinePointer, prefersReducedMotion } from './motion-utils';

/**
 * 3D tilt that follows the mouse, with an optional glare highlight.
 *
 *   <div appTilt>…</div>
 *   <div [appTilt]="12" [tiltScale]="1.04" [tiltGlare]="false">…</div>
 */
@Directive({
  selector: '[appTilt]',
  host: {
    class: 'tilt',
    '[class.tilt-glare]': 'tiltGlare()',
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'reset()',
  },
})
export class Tilt {
  /** Maximum rotation in degrees (default 8). */
  readonly appTilt = input<number | string>('');
  readonly tiltScale = input(1.02);
  readonly tiltGlare = input(true);

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
      if (!rect.width || !rect.height) return;
      const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const max = Number(this.appTilt()) || 8;
      const style = this.el.style;
      style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      style.setProperty('--ts', String(this.tiltScale()));
      this.el.classList.add('is-tilting');
    });
  }

  protected reset(): void {
    cancelAnimationFrame(this.frame);
    this.el.classList.remove('is-tilting');
  }
}
