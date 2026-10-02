import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  createEmptyContent,
  type DesignSettings,
  type Resume,
  type ResumeContent,
  TWO_COLUMN_LAYOUTS,
} from '../../core/models/resume.models';
import { ResumeService } from '../../core/services/resume.service';
import { DEFAULT_DESIGN } from '../../shared/resume/resume-renderer';

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

const HISTORY_LIMIT = 60;

/**
 * State for one open resume: content, design, autosave and undo/redo history.
 * Provided at the Builder component level.
 */
@Injectable()
export class BuilderStore implements OnDestroy {
  private readonly api = inject(ResumeService);

  readonly id = signal<string | null>(null);
  readonly title = signal('');
  readonly templateId = signal<string | null>(null);
  readonly content = signal<ResumeContent>(createEmptyContent());
  readonly design = signal<DesignSettings>(DEFAULT_DESIGN);
  readonly atsScore = signal<number | null>(null);
  readonly saveState = signal<SaveState>('saved');
  readonly lastSaved = signal<Date | null>(null);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly twoColumn = computed(() => TWO_COLUMN_LAYOUTS.includes(this.design().layout));

  private history: string[] = [];
  private pointer = -1;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private pendingAfterSave = false;

  load(resume: Resume): void {
    this.id.set(resume.id);
    this.title.set(resume.title);
    this.templateId.set(resume.templateId);
    this.content.set(resume.content);
    this.design.set({ ...DEFAULT_DESIGN, ...resume.design });
    this.atsScore.set(resume.atsScore);
    this.saveState.set('saved');
    this.lastSaved.set(new Date(resume.updatedAt));
    this.history = [this.snapshot()];
    this.pointer = 0;
    this.syncHistoryFlags();
  }

  /** Call after mutating the content object in place (template-driven forms). */
  touchContent(): void {
    this.content.set({ ...this.content() });
    this.changed();
  }

  replaceContent(content: ResumeContent): void {
    this.content.set(content);
    this.changed(true);
  }

  updateContent(mutator: (content: ResumeContent) => void): void {
    const next = structuredClone(this.content());
    mutator(next);
    this.content.set(next);
    this.changed();
  }

  setDesign(patch: Partial<DesignSettings>): void {
    this.design.set({ ...this.design(), ...patch });
    this.changed();
  }

  replaceDesign(design: DesignSettings, templateId?: string): void {
    this.design.set({ ...DEFAULT_DESIGN, ...design });
    if (templateId) this.templateId.set(templateId);
    this.changed(true);
  }

  setTitle(title: string): void {
    this.title.set(title);
    this.scheduleSave();
  }

  undo(): void {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.pointer <= 0) return;
    this.pointer--;
    this.restore(this.history[this.pointer]);
  }

  redo(): void {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.pointer >= this.history.length - 1) return;
    this.pointer++;
    this.restore(this.history[this.pointer]);
  }

  ngOnDestroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  /** Saves immediately (used before exports and when leaving the page). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    // Wait for in-flight saves and keep saving while newer changes are pending.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (this.saving) {
        await this.saving;
      } else if (this.saveState() === 'dirty' || this.saveState() === 'error') {
        await this.save();
        if (this.saveState() === 'error') return;
      } else {
        return;
      }
    }
  }

  private changed(immediateSnapshot = false): void {
    this.saveState.set('dirty');
    this.scheduleSave();
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    if (immediateSnapshot) this.pushSnapshot();
    else this.snapshotTimer = setTimeout(() => this.pushSnapshot(), 450);
  }

  private scheduleSave(): void {
    this.saveState.set('dirty');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 900);
  }

  private async save(): Promise<void> {
    const id = this.id();
    if (!id) return;
    if (this.saving) {
      this.pendingAfterSave = true;
      return this.saving;
    }
    this.saveState.set('saving');
    this.saving = (async () => {
      try {
        const updated = await firstValueFrom(
          this.api.update(id, {
            title: this.title().trim() || 'Untitled Resume',
            content: this.content(),
            design: this.design(),
            templateId: this.templateId() ?? undefined,
          }),
        );
        this.lastSaved.set(new Date(updated.updatedAt));
        this.saveState.set(this.pendingAfterSave ? 'dirty' : 'saved');
      } catch {
        this.saveState.set('error');
      } finally {
        this.saving = null;
        if (this.pendingAfterSave) {
          this.pendingAfterSave = false;
          void this.save();
        }
      }
    })();
    return this.saving;
  }

  private snapshot(): string {
    return JSON.stringify({ content: this.content(), design: this.design() });
  }

  private pushSnapshot(): void {
    const snap = this.snapshot();
    if (this.history[this.pointer] === snap) return;
    this.history = this.history.slice(0, this.pointer + 1);
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.pointer = this.history.length - 1;
    this.syncHistoryFlags();
  }

  private restore(snap: string): void {
    const { content, design } = JSON.parse(snap) as { content: ResumeContent; design: DesignSettings };
    this.content.set(content);
    this.design.set(design);
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  private syncHistoryFlags(): void {
    this.canUndo.set(this.pointer > 0);
    this.canRedo.set(this.pointer < this.history.length - 1);
  }
}
