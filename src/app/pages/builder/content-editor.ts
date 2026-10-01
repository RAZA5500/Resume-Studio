import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ImproveMode, SkillSuggestions } from '../../core/models/app.models';
import {
  bulletLines,
  dateRange,
  LANGUAGE_LEVELS,
  SECTION_ICONS,
  sectionTitle,
  uid,
} from '../../core/models/resume.models';
import { AiService } from '../../core/services/ai.service';
import { DialogService, ToastService } from '../../core/services/ui.service';
import { resizeImage } from '../../core/utils/files';
import { errorMessage } from '../../core/utils/http';
import { BuilderStore } from './builder-store';

interface AiPanel {
  target: string;
  kind: 'options' | 'bullets';
  loading: boolean;
  options: string[];
  source?: string;
}

@Component({
  selector: 'app-content-editor',
  imports: [FormsModule, NgTemplateOutlet, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
  templateUrl: './content-editor.html',
  styleUrl: './content-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentEditor {
  protected readonly store = inject(BuilderStore);
  protected readonly ai = inject(AiService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);

  protected readonly c = computed(() => this.store.content());
  protected readonly open = signal<Set<string>>(new Set(['personal', 'summary', 'experience']));
  protected readonly openItem = signal<string | null>(null);
  protected readonly aiPanel = signal<AiPanel | null>(null);
  protected readonly skillSuggestions = signal<SkillSuggestions | null>(null);
  protected readonly suggestingSkills = signal(false);
  protected readonly levels = LANGUAGE_LEVELS;
  protected readonly dateRange = dateRange;

  // ------------------------------------------------------------------ helpers
  protected touch(): void {
    this.store.touchContent();
  }

  protected set<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
    target[key] = value;
    this.touch();
  }

  protected wordCount(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  protected isOpen(key: string): boolean {
    return this.open().has(key);
  }

  protected toggle(key: string): void {
    const next = new Set(this.open());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.open.set(next);
  }

  protected toggleItem(id: string): void {
    this.openItem.set(this.openItem() === id ? null : id);
  }

  protected icon(key: string): string {
    return SECTION_ICONS[key] ?? 'dashboard_customize';
  }

  protected title(key: string): string {
    return sectionTitle(this.c(), key);
  }

  protected type(key: string): string {
    return key.startsWith('custom:') ? 'custom' : key;
  }

  protected customSection(key: string) {
    return this.c().customSections.find((s) => `custom:${s.id}` === key);
  }

  protected count(key: string): number {
    const c = this.c();
    switch (key) {
      case 'summary':
        return c.summary.trim() ? 1 : 0;
      case 'experience':
      case 'education':
      case 'skills':
      case 'projects':
      case 'certifications':
      case 'languages':
      case 'awards':
      case 'interests':
        return (c[key] as unknown[]).length;
      default:
        return this.customSection(key)?.items.length ?? 0;
    }
  }

  protected isHidden(key: string): boolean {
    return this.c().hiddenSections.includes(key);
  }

  protected toggleHidden(key: string, event: Event): void {
    event.stopPropagation();
    const c = this.c();
    c.hiddenSections = this.isHidden(key) ? c.hiddenSections.filter((k) => k !== key) : [...c.hiddenSections, key];
    this.touch();
  }

  protected async renameSection(key: string, event: Event): Promise<void> {
    event.stopPropagation();
    const value = await this.dialogs.prompt({ title: 'Rename section', label: 'Section title', value: this.title(key) });
    if (!value) return;
    const custom = this.customSection(key);
    if (custom) custom.title = value;
    else this.c().sectionTitles[key] = value;
    this.touch();
  }

  protected drop(event: CdkDragDrop<string[]>): void {
    const order = [...this.c().sectionOrder];
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    this.c().sectionOrder = order;
    this.touch();
  }

  protected move<T>(list: T[], index: number, delta: number, event: Event): void {
    event.stopPropagation();
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    moveItemInArray(list, index, target);
    this.touch();
  }

  protected removeItem<T extends { id: string }>(list: T[], item: T, event?: Event): void {
    event?.stopPropagation();
    const index = list.findIndex((x) => x.id === item.id);
    if (index >= 0) list.splice(index, 1);
    this.touch();
  }

  protected duplicateItem<T extends { id: string }>(list: T[], item: T, event: Event): void {
    event.stopPropagation();
    const index = list.findIndex((x) => x.id === item.id);
    const copy = { ...structuredClone(item), id: uid() };
    list.splice(index + 1, 0, copy);
    this.openItem.set(copy.id);
    this.touch();
  }

  // ------------------------------------------------------------------ personal
  protected async uploadPhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.c().personal.photo = await resizeImage(file, 400, true);
      this.touch();
      if (!this.store.design().showPhoto) this.store.setDesign({ showPhoto: true });
    } catch {
      this.toast.error('Could not read this image.');
    }
  }

  protected removePhoto(): void {
    this.c().personal.photo = '';
    this.touch();
  }

  // ------------------------------------------------------------------ add items
  protected addExperience(): void {
    const item = { id: uid(), jobTitle: '', company: '', location: '', startDate: '', endDate: '', current: false, description: '' };
    this.c().experience.push(item);
    this.openItem.set(item.id);
    this.touch();
  }

  protected addEducation(): void {
    const item = { id: uid(), degree: '', institution: '', location: '', startDate: '', endDate: '', current: false, gpa: '', description: '' };
    this.c().education.push(item);
    this.openItem.set(item.id);
    this.touch();
  }

  protected addProject(): void {
    const item = { id: uid(), name: '', role: '', link: '', startDate: '', endDate: '', description: '' };
    this.c().projects.push(item);
    this.openItem.set(item.id);
    this.touch();
  }

  protected addCertification(): void {
    const item = { id: uid(), name: '', issuer: '', date: '', link: '' };
    this.c().certifications.push(item);
    this.openItem.set(item.id);
    this.touch();
  }

  protected addAward(): void {
    const item = { id: uid(), title: '', issuer: '', date: '', description: '' };
    this.c().awards.push(item);
    this.openItem.set(item.id);
    this.touch();
  }

  protected addLanguage(): void {
    this.c().languages.push({ id: uid(), name: '', proficiency: 'Professional' });
    this.touch();
  }

  protected addCustomItem(key: string): void {
    const section = this.customSection(key);
    if (!section) return;
    const item = { id: uid(), title: '', subtitle: '', date: '', description: '' };
    section.items.push(item);
    this.openItem.set(item.id);
    this.touch();
  }

  protected async addCustomSection(): Promise<void> {
    const title = await this.dialogs.prompt({
      title: 'Add custom section',
      label: 'Section title',
      placeholder: 'e.g. Volunteering, Publications, References',
    });
    if (!title) return;
    const id = uid();
    const c = this.c();
    c.customSections.push({ id, title, items: [{ id: uid(), title: '', subtitle: '', date: '', description: '' }] });
    c.sectionOrder.push(`custom:${id}`);
    this.open.set(new Set([...this.open(), `custom:${id}`]));
    this.touch();
  }

  protected async deleteCustomSection(key: string, event: Event): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.dialogs.confirm({
      title: 'Delete section?',
      message: `"${this.title(key)}" and all of its entries will be removed.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const c = this.c();
    c.customSections = c.customSections.filter((s) => `custom:${s.id}` !== key);
    c.sectionOrder = c.sectionOrder.filter((k) => k !== key);
    this.touch();
  }

  // ------------------------------------------------------------------ skills & interests
  protected addSkills(input: HTMLInputElement): void {
    const names = input.value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    input.value = '';
    this.addSkillNames(names);
  }

  protected addSkillNames(names: string[]): void {
    const c = this.c();
    const existing = new Set(c.skills.map((s) => s.name.toLowerCase()));
    for (const name of names) {
      if (!existing.has(name.toLowerCase())) {
        c.skills.push({ id: uid(), name, level: 0 });
        existing.add(name.toLowerCase());
      }
    }
    this.touch();
  }

  protected setLevel(skill: { level: number }, level: number): void {
    skill.level = skill.level === level ? 0 : level;
    this.touch();
  }

  protected addInterests(input: HTMLInputElement): void {
    const c = this.c();
    const names = input.value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    input.value = '';
    for (const name of names) c.interests.push({ id: uid(), name });
    this.touch();
  }

  protected suggestSkills(): void {
    const c = this.c();
    const jobTitle = c.personal.jobTitle || c.experience[0]?.jobTitle;
    if (!jobTitle) {
      this.toast.info('Add your job title in Personal details first so the AI knows what to suggest.');
      return;
    }
    this.suggestingSkills.set(true);
    this.ai.skills(jobTitle, c.skills.map((s) => s.name)).subscribe({
      next: (result) => {
        this.skillSuggestions.set(result);
        this.suggestingSkills.set(false);
      },
      error: (e: unknown) => {
        this.suggestingSkills.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  protected addSuggestedSkill(name: string): void {
    this.addSkillNames([name]);
    const current = this.skillSuggestions();
    if (current) {
      const drop = (list: string[]) => list.filter((s) => s !== name);
      this.skillSuggestions.set({ ...current, hardSkills: drop(current.hardSkills), softSkills: drop(current.softSkills), tools: drop(current.tools) });
    }
  }

  // ------------------------------------------------------------------ AI writing
  protected aiSummary(): void {
    const c = this.c();
    this.aiPanel.set({ target: 'summary', kind: 'options', loading: true, options: [] });
    this.ai.summary({ ...c, personal: { ...c.personal, photo: '' } }, c.personal.jobTitle).subscribe({
      next: (res) => this.aiPanel.set({ target: 'summary', kind: 'options', loading: false, options: res.options, source: res.source }),
      error: (e: unknown) => this.aiFailed(e),
    });
  }

  protected aiImprove(target: string, text: string, mode: ImproveMode): void {
    if (!text.trim()) {
      this.toast.info('Write something first — the AI will polish it.');
      return;
    }
    this.aiPanel.set({ target, kind: 'options', loading: true, options: [] });
    this.ai.improve(text, mode).subscribe({
      next: (res) =>
        this.aiPanel.set({
          target,
          kind: 'options',
          loading: false,
          options: [res.text, ...res.alternatives].filter(Boolean),
          source: res.source,
        }),
      error: (e: unknown) => this.aiFailed(e),
    });
  }

  protected aiBullets(target: string, jobTitle: string, company: string, description: string): void {
    if (!jobTitle.trim()) {
      this.toast.info('Enter the job title first.');
      return;
    }
    this.aiPanel.set({ target, kind: 'bullets', loading: true, options: [] });
    this.ai.bullets(jobTitle, company, description, 5, bulletLines(description)).subscribe({
      next: (res) => this.aiPanel.set({ target, kind: 'bullets', loading: false, options: res.bullets, source: res.source }),
      error: (e: unknown) => this.aiFailed(e),
    });
  }

  protected applyAi(text: string, mode: 'replace' | 'append'): void {
    const panel = this.aiPanel();
    if (!panel) return;
    const holder = this.resolveTarget(panel.target);
    if (!holder) return;
    const current = holder.get();
    holder.set(mode === 'append' && current.trim() ? `${current.trim()}\n${text}` : text);
    if (panel.kind === 'bullets') {
      this.aiPanel.set({ ...panel, options: panel.options.filter((o) => o !== text) });
    } else {
      this.aiPanel.set(null);
    }
    this.touch();
  }

  protected applyAllBullets(): void {
    const panel = this.aiPanel();
    const holder = panel && this.resolveTarget(panel.target);
    if (!panel || !holder) return;
    const current = holder.get().trim();
    holder.set([current, ...panel.options].filter(Boolean).join('\n'));
    this.aiPanel.set(null);
    this.touch();
  }

  private resolveTarget(target: string): { get: () => string; set: (v: string) => void } | null {
    const c = this.c();
    if (target === 'summary') return { get: () => c.summary, set: (v) => (c.summary = v) };
    const [kind, id, sub] = target.split(':');
    const find = <T extends { id: string }>(list: T[], key: string) => list.find((x) => x.id === key);
    const item =
      kind === 'exp'
        ? find(c.experience, id)
        : kind === 'edu'
          ? find(c.education, id)
          : kind === 'proj'
            ? find(c.projects, id)
            : kind === 'award'
              ? find(c.awards, id)
              : kind === 'custom'
                ? find(c.customSections.find((s) => s.id === id)?.items ?? [], sub)
                : undefined;
    if (!item) return null;
    return { get: () => item.description, set: (v) => (item.description = v) };
  }

  private aiFailed(error: unknown): void {
    this.aiPanel.set(null);
    this.toast.error(errorMessage(error));
  }
}
