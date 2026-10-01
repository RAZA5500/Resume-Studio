import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import type { Template, TemplateMeta, TemplatePage, TemplateQuery } from '../models/app.models';
import type { DesignSettings, Resume, ResumeContent } from '../models/resume.models';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private readonly http = inject(HttpClient);
  private meta$?: Observable<TemplateMeta>;

  list(query: TemplateQuery): Observable<TemplatePage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '' || value === false) continue;
      params = params.set(key, String(value));
    }
    return this.http.get<TemplatePage>('/api/templates', { params });
  }

  meta(): Observable<TemplateMeta> {
    this.meta$ ??= this.http.get<TemplateMeta>('/api/templates/meta').pipe(shareReplay(1));
    return this.meta$;
  }

  get(id: string): Observable<Template> {
    return this.http.get<Template>(`/api/templates/${encodeURIComponent(id)}`);
  }
}

export interface CreateResumeBody {
  title?: string;
  templateId?: string;
  content?: ResumeContent;
  useSample?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ResumeService {
  private readonly http = inject(HttpClient);

  list(): Observable<Resume[]> {
    return this.http.get<Resume[]>('/api/resumes');
  }

  get(id: string): Observable<Resume> {
    return this.http.get<Resume>(`/api/resumes/${id}`);
  }

  create(body: CreateResumeBody): Observable<Resume> {
    return this.http.post<Resume>('/api/resumes', body);
  }

  update(
    id: string,
    patch: { title?: string; templateId?: string; content?: ResumeContent; design?: DesignSettings },
  ): Observable<Resume> {
    return this.http.patch<Resume>(`/api/resumes/${id}`, patch);
  }

  duplicate(id: string): Observable<Resume> {
    return this.http.post<Resume>(`/api/resumes/${id}/duplicate`, {});
  }

  remove(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(`/api/resumes/${id}`);
  }

  exportDocx(id: string): Observable<Blob> {
    return this.http.get(`/api/resumes/${id}/export/docx`, { responseType: 'blob' });
  }

  exportText(id: string): Observable<Blob> {
    return this.http.get(`/api/resumes/${id}/export/txt`, { responseType: 'blob' });
  }
}
