import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { CountUp } from '../motion/count-up';
import { observeVisibility } from '../motion/motion-utils';

@Component({
  selector: 'app-score-ring',
  imports: [CountUp],
  template: `
    <div class="ring" [style.width.px]="size()" [style.height.px]="size()">
      <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()">
        <circle class="track" [attr.cx]="half()" [attr.cy]="half()" [attr.r]="radius()" [attr.stroke-width]="stroke()" />
        <circle class="bar" [attr.cx]="half()" [attr.cy]="half()" [attr.r]="radius()" [attr.stroke-width]="stroke()"
          [attr.stroke]="color()" [attr.stroke-dasharray]="circumference()" [attr.stroke-dashoffset]="offset()"
          [attr.transform]="'rotate(-90 ' + half() + ' ' + half() + ')'"
          [style.filter]="'drop-shadow(0 0 ' + glow() + 'px ' + color() + ')'" />
      </svg>
      <div class="value">
        <strong [style.font-size.px]="size() * 0.27" [style.color]="color()" [appCountUp]="score()" [countDuration]="1500"></strong>
        @if (label()) {
          <span>{{ label() }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: inline-block; }
    .ring { position: relative; }
    svg { width: 100%; height: 100%; overflow: visible; }
    .track { fill: none; stroke: var(--surface-3); }
    .bar { fill: none; stroke-linecap: round; transition: stroke-dashoffset 1.5s var(--ease-out), stroke 0.4s var(--ease); }
    .value { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
    strong { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
    span { margin-top: 4px; font-size: 10.5px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreRing {
  readonly score = input.required<number>();
  readonly size = input(120);
  readonly label = input<string>('');

  /** The ring fills up the first time it scrolls into view. */
  private readonly visible = signal(false);

  protected readonly stroke = computed(() => Math.max(6, this.size() * 0.085));
  protected readonly half = computed(() => this.size() / 2);
  protected readonly radius = computed(() => this.half() - this.stroke() / 2 - 1);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly offset = computed(() => {
    const value = this.visible() ? Math.min(100, Math.max(0, this.score())) : 0;
    return this.circumference() * (1 - value / 100);
  });
  protected readonly color = computed(() => scoreColor(this.score()));
  protected readonly glow = computed(() => Math.max(3, Math.round(this.size() / 22)));

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const stop = observeVisibility(
      element,
      (entry) => {
        if (!entry.isIntersecting) return;
        stop();
        requestAnimationFrame(() => this.visible.set(true));
      },
      { threshold: 0.3, rootMargin: '0px' },
    );
    inject(DestroyRef).onDestroy(stop);
  }
}

export function scoreColor(score: number): string {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#84cc16';
  if (score >= 55) return '#f59e0b';
  return '#f43f5e';
}
