import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { hasFinePointer, isLite, listen, prefersReducedMotion } from './motion-utils';

/**
 * Makes an element lean towards the cursor and spring back when it leaves.
 * Uses the individual `translate` property so it composes with transforms.
 *
 *   <a class="btn btn-primary" appMagnetic>…</a>
 *   <a [appMagnetic]="0.45">…</a>
 */
@Directive({ selector: '[appMagnetic]' })
export class Magnetic {
  /** Pull strength from 0 to 1 (default 0.3). */
  readonly appMagnetic = input<number | string>('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private frame = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => cancelAnimationFrame(this.frame));
    if (!hasFinePointer() || prefersReducedMotion()) return;
    const offMove = listen(this.el, 'pointermove', (event) => this.onMove(event));
    const offLeave = listen(this.el, 'pointerleave', () => this.reset());
    destroyRef.onDestroy(() => {
      offMove();
      offLeave();
    });
  }

  private onMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || isLite()) return;
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

  private reset(): void {
    cancelAnimationFrame(this.frame);
    this.el.style.translate = '';
  }
}
