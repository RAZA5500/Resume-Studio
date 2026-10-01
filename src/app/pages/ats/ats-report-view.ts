import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { AtsReport } from '../../core/models/app.models';
import { ToastService } from '../../core/services/ui.service';
import { ScoreRing, scoreColor } from '../../shared/ui/score-ring';

const CATEGORY_ICONS: Record<string, string> = {
  contact: 'contact_mail',
  sections: 'view_agenda',
  keywords: 'key',
  impact: 'trending_up',
  length: 'straighten',
  formatting: 'document_scanner',
  language: 'spellcheck',
};

@Component({
  selector: 'app-ats-report-view',
  imports: [ScoreRing, DatePipe, DecimalPipe],
  templateUrl: './ats-report-view.html',
  styleUrl: './ats-report-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtsReportView {
  private readonly toast = inject(ToastService);

  readonly report = input.required<AtsReport>();

  protected readonly showText = signal(false);
  protected readonly issueFilter = signal<'all' | 'critical' | 'warning' | 'info'>('all');
  protected readonly scoreColor = scoreColor;

  protected readonly result = computed(() => this.report().result!);
  protected readonly ai = computed(() => this.report().aiAnalysis ?? null);
  protected readonly issues = computed(() => {
    const filter = this.issueFilter();
    return this.result().issues.filter((i) => filter === 'all' || i.severity === filter);
  });
  protected readonly counts = computed(() => {
    const issues = this.result().issues;
    return {
      critical: issues.filter((i) => i.severity === 'critical').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    };
  });

  protected icon(key: string): string {
    return CATEGORY_ICONS[key] ?? 'check';
  }

  protected pct(score: number, max: number): number {
    return Math.round((score / max) * 100);
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Copy failed');
    }
  }
}
