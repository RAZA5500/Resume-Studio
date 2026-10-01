import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DocumentFile } from '../../core/models/app.models';
import { DocumentService } from '../../core/services/document.service';
import { errorMessage } from '../../core/utils/http';
import { CanvasEditor } from './canvas/canvas-editor';
import { RichEditor } from './rich/rich-editor';

@Component({
  selector: 'app-doc-editor',
  imports: [RouterLink, RichEditor, CanvasEditor],
  template: `
    @if (loading()) {
      <div class="state"><span class="spinner lg"></span><p>Opening document…</p></div>
    } @else if (error()) {
      <div class="state">
        <span class="i xl">error</span>
        <h3>{{ error() }}</h3>
        <a class="btn btn-primary" routerLink="/app/documents">Back to documents</a>
      </div>
    } @else if (doc(); as d) {
      @if (d.kind === 'rich') {
        <app-rich-editor [doc]="d" />
      } @else {
        <app-canvas-editor [doc]="d" />
      }
    }
  `,
  styles: `
    :host { display: block; height: 100vh; }
    .state { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--text-2); }
    .state .spinner { color: var(--primary); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocEditor {
  private readonly documents = inject(DocumentService);

  /** Route parameter. */
  readonly id = input.required<string>();

  protected readonly doc = signal<DocumentFile | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    effect(() => {
      const id = this.id();
      this.loading.set(true);
      this.documents.get(id).subscribe({
        next: (doc) => {
          this.doc.set(doc);
          this.loading.set(false);
        },
        error: (e: unknown) => {
          this.error.set(errorMessage(e, 'Document not found'));
          this.loading.set(false);
        },
      });
    });
  }
}
