import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { hasFinePointer } from './motion-utils';

/**
 * Publishes the pointer position as CSS variables for spotlight and parallax effects:
 *   --mx / --my  pointer position in px, relative to the element
 *   --px / --py  normalised position from -1 to 1 (0 = centre, reset on leave)
 *
 * With appPointer="spots" every descendant marked data-spot also gets its own
 * --mx / --my, so a cursor glow can travel across a grid of cards (.spot class).
 */
@Directive({
  selector: '[appPointer]',
  host: {
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'onLeave()',
  },
})
export class PointerFx {
  readonly appPointer = input<'' | 'spots'>('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly enabled = hasFinePointer();
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
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const style = this.el.style;
      style.setProperty('--mx', `${x.toFixed(0)}px`);
      style.setProperty('--my', `${y.toFixed(0)}px`);
      if (rect.width && rect.height) {
        style.setProperty('--px', ((x / rect.width) * 2 - 1).toFixed(3));
        style.setProperty('--py', ((y / rect.height) * 2 - 1).toFixed(3));
      }
      if (this.appPointer() === 'spots') {
        for (const spot of Array.from(this.el.querySelectorAll<HTMLElement>('[data-spot]'))) {
          const r = spot.getBoundingClientRect();
          spot.style.setProperty('--mx', `${(clientX - r.left).toFixed(0)}px`);
          spot.style.setProperty('--my', `${(clientY - r.top).toFixed(0)}px`);
        }
      }
    });
  }

  protected onLeave(): void {
    cancelAnimationFrame(this.frame);
    this.el.style.setProperty('--px', '0');
    this.el.style.setProperty('--py', '0');
  }
}
