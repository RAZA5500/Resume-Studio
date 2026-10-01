import { DestroyRef, Directive, ElementRef, inject, input, OnInit } from '@angular/core';
import { observeVisibility, prefersReducedMotion } from './motion-utils';

export type RevealVariant = 'up' | 'down' | 'left' | 'right' | 'zoom' | 'blur' | 'fade' | 'tilt';

/**
 * Animates an element into place the first time it scrolls into view.
 *
 *   <section appReveal>…</section>
 *   <li appReveal="left" [revealDelay]="$index * 80">…</li>
 */
@Directive({ selector: '[appReveal]' })
export class Reveal implements OnInit {
  readonly appReveal = input<RevealVariant | ''>('');
  readonly revealDelay = input(0);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly enabled = !prefersReducedMotion();
  private stop: (() => void) | null = null;
  private timer = 0;

  constructor() {
    // Hide immediately so the element never flashes before its entrance.
    if (this.enabled) this.el.classList.add('rv');
    inject(DestroyRef).onDestroy(() => {
      this.stop?.();
      clearTimeout(this.timer);
    });
  }

  ngOnInit(): void {
    if (!this.enabled) return;
    const variant = this.appReveal();
    if (variant && variant !== 'up') this.el.dataset['rv'] = variant;
    const delay = Math.max(0, this.revealDelay());
    if (delay) this.el.style.setProperty('--rv-delay', `${delay}ms`);

    this.stop = observeVisibility(this.el, (entry) => {
      if (!entry.isIntersecting) return;
      this.stop?.();
      this.stop = null;
      this.el.classList.add('rv-in');
      // Remove the reveal styles afterwards so hover transitions are not delayed or overridden.
      this.timer = window.setTimeout(() => {
        this.el.classList.remove('rv', 'rv-in');
        delete this.el.dataset['rv'];
        this.el.style.removeProperty('--rv-delay');
      }, delay + 1150);
    });
  }
}
