import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import type { Template, TemplatePage, TemplateQuery } from '../../core/models/app.models';
import { type ResumeContent, SAMPLE_CONTENT } from '../../core/models/resume.models';
import { TemplateService } from '../../core/services/resume.service';
import { ScaledResume } from '../../shared/resume/scaled-resume';

const COLOR_SWATCHES: Record<string, string> = {
  blue: '#1d4ed8',
  purple: '#6d28d9',
  green: '#047857',
  teal: '#0f766e',
  red: '#b91c1c',
  pink: '#be185d',
  orange: '#c2410c',
  yellow: '#a16207',
  brown: '#78350f',
  black: '#111111',
  gray: '#475569',
};

@Component({
  selector: 'app-template-gallery',
  imports: [FormsModule, ScaledResume],
  templateUrl: './template-gallery.html',
  styleUrl: './template-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateGallery {
  private readonly templates = inject(TemplateService);

  constructor() {
    effect(() => {
      // Track filter changes to reset page back to 1
      this.search();
      this.category();
      this.layout();
      this.color();
      this.font();
      this.atsOnly();
      this.photo();
      this.columns();
      this.sort();
      this.page.set(1);
    });
  }

  /** Content used for thumbnails (the user's own resume inside the builder). */
  readonly content = input<ResumeContent>(SAMPLE_CONTENT);
  readonly compact = input(false);
  readonly actionLabel = input('Use this template');
  readonly currentId = input<string | null>(null);
  readonly selected = output<Template>();

  protected readonly meta = toSignal(this.templates.meta().pipe(catchError(() => of(null))), { initialValue: null });
  protected readonly swatches = COLOR_SWATCHES;

  protected readonly search = signal('');
  protected readonly category = signal('all');
  protected readonly layout = signal('');
  protected readonly color = signal('');
  protected readonly font = signal('');
  protected readonly atsOnly = signal(false);
  protected readonly photo = signal<'' | 'true' | 'false'>('');
  protected readonly columns = signal<'' | '1' | '2'>('');
  protected readonly sort = signal<'popular' | 'name' | 'featured'>('popular');
  protected readonly page = signal(1);
  protected readonly previewing = signal<Template | null>(null);
  protected readonly showFilters = signal(false);

  private readonly query = computed<TemplateQuery>(() => ({
    search: this.search().trim() || undefined,
    category: this.category() === 'all' ? undefined : this.category(),
    layout: this.layout() || undefined,
    color: this.color() || undefined,
    font: this.font() || undefined,
    ats: this.atsOnly() || undefined,
    photo: this.photo(),
    columns: this.columns(),
    sort: this.sort(),
    page: this.page(),
    limit: this.compact() ? 12 : 24,
  }));

  private readonly state = toSignal(
    toObservable(this.query).pipe(
      debounceTime(200),
      switchMap((query) =>
        this.templates.list(query).pipe(
          map((result) => ({ loading: false, result, error: false })),
          startWith({ loading: true, result: null as TemplatePage | null, error: false }),
          catchError(() => of({ loading: false, result: null as TemplatePage | null, error: true })),
        ),
      ),
    ),
    { initialValue: { loading: true, result: null as TemplatePage | null, error: false } },
  );

  private lastResult: TemplatePage | null = null;
  protected readonly result = computed(() => {
    const state = this.state();
    if (state.result) this.lastResult = state.result;
    return state.result ?? this.lastResult;
  });
  protected readonly loading = computed(() => this.state().loading);
  protected readonly failed = computed(() => this.state().error);

  protected readonly pages = computed(() => {
    const total = this.result()?.pages ?? 1;
    const current = this.page();
    const set = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
    return [...set].sort((a, b) => a - b);
  });

  protected readonly activeFilterCount = computed(
    () =>
      [this.layout(), this.color(), this.font(), this.photo(), this.columns()].filter(Boolean).length +
      (this.atsOnly() ? 1 : 0),
  );

  protected resetFilters(): void {
    this.search.set('');
    this.category.set('all');
    this.layout.set('');
    this.color.set('');
    this.font.set('');
    this.atsOnly.set(false);
    this.photo.set('');
    this.columns.set('');
    this.page.set(1);
  }

  protected goTo(page: number): void {
    this.page.set(page);
  }

  protected choose(template: Template): void {
    this.previewing.set(null);
    this.selected.emit(template);
  }
}
