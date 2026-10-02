import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  AiSource,
  AiStatus,
  CoverLetterResult,
  ImproveMode,
  ImproveResult,
  SkillSuggestions,
  TailorResult,
} from '../models/app.models';
import type { ResumeContent } from '../models/resume.models';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly http = inject(HttpClient);

  readonly status = signal<AiStatus | null>(null);
  readonly enabled = computed(() => this.status()?.enabled ?? false);
  /** Model name without the OpenRouter provider prefix, e.g. "claude-sonnet-5.5". */
  readonly model = computed(() => this.status()?.model?.split('/').pop() ?? '');

  loadStatus(): void {
    this.http.get<AiStatus>('/api/ai/status').subscribe({
      next: (status) => this.status.set(status),
      error: () => this.status.set({ enabled: false, model: null, provider: 'Offline assistant' }),
    });
  }

  /** Pass `resumeId` when filling an existing resume, so it does not count as a new one. */
  generateResume(prompt: string, targetRole?: string, experienceLevel?: string, resumeId?: string) {
    return this.http.post<{ content: ResumeContent; source: AiSource }>('/api/ai/generate-resume', {
      prompt,
      targetRole: targetRole || undefined,
      experienceLevel: experienceLevel || undefined,
      resumeId: resumeId || undefined,
    });
  }

  parseResume(file: File, resumeId?: string) {
    const form = new FormData();
    form.append('file', file);
    if (resumeId) form.append('resumeId', resumeId);
    return this.http.post<{ content: ResumeContent; source: AiSource; warnings: string[] }>('/api/ai/parse-resume', form);
  }

  summary(content: ResumeContent, targetRole?: string, tone?: string) {
    return this.http.post<{ options: string[]; source: AiSource }>('/api/ai/summary', {
      content,
      targetRole: targetRole || undefined,
      tone,
    });
  }

  improve(text: string, mode: ImproveMode, instruction?: string, context?: string): Observable<ImproveResult> {
    return this.http.post<ImproveResult>('/api/ai/improve', {
      text,
      mode,
      instruction: instruction || undefined,
      context: context || undefined,
    });
  }

  bullets(jobTitle: string, company?: string, context?: string, count = 5, existing: string[] = []) {
    return this.http.post<{ bullets: string[]; source: AiSource }>('/api/ai/bullets', {
      jobTitle,
      company: company || undefined,
      context: context || undefined,
      count,
      existing,
    });
  }

  skills(jobTitle: string, existing: string[] = [], jobDescription?: string): Observable<SkillSuggestions> {
    return this.http.post<SkillSuggestions>('/api/ai/skills', {
      jobTitle,
      existing,
      jobDescription: jobDescription || undefined,
    });
  }

  tailor(content: ResumeContent, jobDescription: string): Observable<TailorResult> {
    return this.http.post<TailorResult>('/api/ai/tailor', { content, jobDescription });
  }

  coverLetter(body: {
    content?: ResumeContent;
    resumeId?: string;
    jobDescription: string;
    company?: string;
    hiringManager?: string;
    tone?: string;
  }): Observable<CoverLetterResult> {
    return this.http.post<CoverLetterResult>('/api/ai/cover-letter', body);
  }
}
