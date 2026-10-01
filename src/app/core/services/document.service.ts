import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { DocumentFile, ExtractionResult } from '../models/app.models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(HttpClient);

  list(): Observable<DocumentFile[]> {
    return this.http.get<DocumentFile[]>('/api/documents');
  }

  get(id: string): Observable<DocumentFile> {
    return this.http.get<DocumentFile>(`/api/documents/${id}`);
  }

  upload(file: Blob, fileName: string, name?: string): Observable<DocumentFile> {
    const form = new FormData();
    form.append('file', file, fileName);
    if (name) form.append('name', name);
    return this.http.post<DocumentFile>('/api/documents/upload', form);
  }

  create(body: { name: string; kind: 'rich' | 'canvas'; html?: string; width?: number; height?: number }) {
    return this.http.post<DocumentFile>('/api/documents', body);
  }

  update(
    id: string,
    patch: { name?: string; editorState?: Record<string, unknown>; thumbnail?: string; pageCount?: number },
  ): Observable<DocumentFile> {
    return this.http.patch<DocumentFile>(`/api/documents/${id}`, patch);
  }

  remove(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(`/api/documents/${id}`);
  }

  file(id: string): Observable<ArrayBuffer> {
    return this.http.get(`/api/documents/${id}/file`, { responseType: 'arraybuffer' });
  }

  fileBlob(id: string): Observable<Blob> {
    return this.http.get(`/api/documents/${id}/file`, { responseType: 'blob' });
  }

  html(id: string): Observable<{ html: string }> {
    return this.http.get<{ html: string }>(`/api/documents/${id}/html`);
  }

  extractText(id: string): Observable<ExtractionResult> {
    return this.http.post<ExtractionResult>(`/api/documents/${id}/extract-text`, {});
  }

  extractFromFile(file: File): Observable<ExtractionResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ExtractionResult>('/api/documents/extract-text', form);
  }

  convert(file: File, target: 'pdf' | 'docx' | 'txt' | 'html'): Observable<Blob> {
    const form = new FormData();
    form.append('file', file);
    form.append('target', target);
    return this.http.post('/api/export/convert', form, { responseType: 'blob' });
  }
}
