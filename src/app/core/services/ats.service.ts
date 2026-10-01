import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { AtsReport } from '../models/app.models';

export interface AnalyzeOptions {
  jobDescription?: string;
  jobTitle?: string;
  useAi?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AtsService {
  private readonly http = inject(HttpClient);

  analyzeFile(file: File, options: AnalyzeOptions): Observable<AtsReport> {
    const form = new FormData();
    form.append('file', file);
    if (options.jobDescription?.trim()) form.append('jobDescription', options.jobDescription.trim());
    if (options.jobTitle?.trim()) form.append('jobTitle', options.jobTitle.trim());
    form.append('useAi', String(!!options.useAi));
    return this.http.post<AtsReport>('/api/ats/analyze-file', form);
  }

  analyzeResume(resumeId: string, options: AnalyzeOptions): Observable<AtsReport> {
    return this.http.post<AtsReport>('/api/ats/analyze-resume', { resumeId, ...this.clean(options) });
  }

  analyzeText(text: string, options: AnalyzeOptions): Observable<AtsReport> {
    return this.http.post<AtsReport>('/api/ats/analyze-text', { text, ...this.clean(options) });
  }

  reports(): Observable<AtsReport[]> {
    return this.http.get<AtsReport[]>('/api/ats/reports');
  }

  report(id: string): Observable<AtsReport> {
    return this.http.get<AtsReport>(`/api/ats/reports/${id}`);
  }

  remove(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(`/api/ats/reports/${id}`);
  }

  private clean(options: AnalyzeOptions) {
    return {
      jobDescription: options.jobDescription?.trim() || undefined,
      jobTitle: options.jobTitle?.trim() || undefined,
      useAi: !!options.useAi,
    };
  }
}
