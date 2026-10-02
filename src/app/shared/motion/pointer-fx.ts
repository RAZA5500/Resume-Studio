import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { hasFinePointer, isLite, listen } from './motion-utils';

/**
 * Publishes the pointer position as CSS variables for spotlight and parallax effects:
 *   --mx / --my  pointer position in px, relative to the element
 *   --px / --py  normalised position from -1 to 1 (0 = centre, reset on leave)
 *
 * With appPointer="spots" every descendant marked data-spot also gets its own
 * --mx / --my, so a cursor glow can travel across a grid of cards (.spot class).
 */
@Directive({ selector: '[appPointer]' })
export class PointerFx {
  readonly appPointer = input<'' | 'spots'>('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private frame = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => cancelAnimationFrame(this.frame));
    if (!hasFinePointer()) return;
    const offMove = listen(this.el, 'pointermove', (event) => this.onMove(event));
    const offLeave = listen(this.el, 'pointerleave', () => this.onLeave());
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
      // Read every rect first, then write: interleaving would force a style pass per card.
      const rect = this.el.getBoundingClientRect();
      const spots =
        this.appPointer() === 'spots'
          ? Array.from(this.el.querySelectorAll<HTMLElement>('[data-spot]'), (spot) => ({
              spot,
              rect: spot.getBoundingClientRect(),
            }))
          : [];

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const style = this.el.style;
      style.setProperty('--mx', `${x.toFixed(0)}px`);
      style.setProperty('--my', `${y.toFixed(0)}px`);
      if (rect.width && rect.height) {
        style.setProperty('--px', ((x / rect.width) * 2 - 1).toFixed(3));
        style.setProperty('--py', ((y / rect.height) * 2 - 1).toFixed(3));
      }
      for (const { spot, rect: r } of spots) {
        spot.style.setProperty('--mx', `${(clientX - r.left).toFixed(0)}px`);
        spot.style.setProperty('--my', `${(clientY - r.top).toFixed(0)}px`);
      }
    });
  }

  private onLeave(): void {
    cancelAnimationFrame(this.frame);
    this.el.style.setProperty('--px', '0');
    this.el.style.setProperty('--py', '0');
  }
}
