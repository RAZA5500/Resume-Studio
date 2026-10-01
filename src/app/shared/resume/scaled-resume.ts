import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { DesignSettings, ResumeContent } from '../../core/models/resume.models';
import { ResumeRenderer } from './resume-renderer';

const MM_TO_PX = 96 / 25.4;

/** Renders a resume scaled down to the width of its container (first page only). */
@Component({
  selector: 'app-scaled-resume',
  imports: [ResumeRenderer],
  template: `
    <div class="frame" #frame [style.height.px]="height()">
      <div class="inner" [style.transform]="'scale(' + scale() + ')'">
        <app-resume-renderer [content]="content()" [design]="design()" [mode]="mode()" />
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .frame { position: relative; overflow: hidden; width: 100%; background: #fff; }
    .inner { position: absolute; top: 0; left: 0; transform-origin: top left; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScaledResume {
  readonly content = input.required<ResumeContent>();
  readonly design = input.required<DesignSettings>();
  readonly mode = input<'thumb' | 'preview'>('thumb');

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly width = signal(0);

  private readonly pageWidth = computed(() => (this.design().pageSize === 'Letter' ? 215.9 : 210) * MM_TO_PX);
  private readonly pageHeight = computed(() => (this.design().pageSize === 'Letter' ? 279.4 : 297) * MM_TO_PX);
  protected readonly scale = computed(() => (this.width() ? this.width() / this.pageWidth() : 0.3));
  protected readonly height = computed(() => Math.round(this.pageHeight() * this.scale()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.frame().nativeElement;
      this.width.set(element.clientWidth);
      const observer = new ResizeObserver(([entry]) => this.width.set(entry.contentRect.width));
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
