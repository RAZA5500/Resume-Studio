import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import type { Palette } from '../../core/models/app.models';
import type { BulletStyle, DateFormat, DesignSettings, HeadingStyle, SkillStyle } from '../../core/models/resume.models';
import { TemplateService } from '../../core/services/resume.service';
import { ToastService } from '../../core/services/ui.service';
import { isDark, mix } from '../../core/utils/colors';
import { FONT_OPTIONS, fontStack } from '../../core/utils/fonts';
import { BuilderStore } from './builder-store';

@Component({
  selector: 'app-design-panel',
  imports: [FormsModule],
  templateUrl: './design-panel.html',
  styleUrl: './design-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignPanel {
  protected readonly store = inject(BuilderStore);
  private readonly templates = inject(TemplateService);
  private readonly toast = inject(ToastService);

  readonly changeTemplate = output<void>();

  protected readonly meta = toSignal(this.templates.meta().pipe(catchError(() => of(null))), { initialValue: null });
  protected readonly d = computed(() => this.store.design());
  protected readonly fonts = FONT_OPTIONS;
  protected readonly fontStack = fontStack;

  protected readonly headingStyles: Array<{ key: HeadingStyle; label: string }> = [
    { key: 'line', label: 'Line' },
    { key: 'underline', label: 'Accent' },
    { key: 'bar', label: 'Bar' },
    { key: 'boxed', label: 'Boxed' },
    { key: 'dot', label: 'Dot' },
    { key: 'double', label: 'Double' },
    { key: 'plain', label: 'Plain' },
  ];
  protected readonly bulletStyles: Array<{ key: BulletStyle; label: string }> = [
    { key: 'disc', label: '•' },
    { key: 'dash', label: '–' },
    { key: 'square', label: '▪' },
    { key: 'arrow', label: '›' },
    { key: 'check', label: '✓' },
    { key: 'none', label: 'None' },
  ];
  protected readonly skillStyles: Array<{ key: SkillStyle; label: string }> = [
    { key: 'tags', label: 'Tags' },
    { key: 'inline', label: 'Inline' },
    { key: 'columns', label: 'Columns' },
    { key: 'list', label: 'List' },
    { key: 'bars', label: 'Bars' },
    { key: 'dots', label: 'Dots' },
  ];
  protected readonly dateFormats: DateFormat[] = ['MMM YYYY', 'MMMM YYYY', 'MM/YYYY', 'YYYY'];

  protected set<K extends keyof DesignSettings>(key: K, value: DesignSettings[K]): void {
    this.store.setDesign({ [key]: value } as Partial<DesignSettings>);
  }

  protected setNumber(key: 'fontSize' | 'lineHeight' | 'margin' | 'sectionGap' | 'sidebarWidth', value: string | number): void {
    this.set(key, Number(value));
  }

  protected applyPalette(palette: Palette): void {
    const darkSidebar = isDark(this.d().sidebarColor);
    this.store.setDesign({
      primaryColor: palette.primary,
      accentColor: palette.accent,
      sidebarColor: darkSidebar ? palette.primary : mix(palette.primary, '#ffffff', 0.08),
      sidebarTextColor: darkSidebar ? '#ffffff' : this.d().textColor,
    });
  }

  protected setSidebarMode(mode: 'dark' | 'light'): void {
    const d = this.d();
    this.store.setDesign(
      mode === 'dark'
        ? { sidebarColor: d.primaryColor, sidebarTextColor: '#ffffff' }
        : { sidebarColor: mix(d.primaryColor, '#ffffff', 0.08), sidebarTextColor: d.textColor },
    );
  }

  protected applyFontPair(heading: string, body: string): void {
    this.store.setDesign({ headingFont: heading, bodyFont: body });
  }

  protected isPaletteActive(palette: Palette): boolean {
    return this.d().primaryColor.toLowerCase() === palette.primary.toLowerCase();
  }

  protected sidebarDark(): boolean {
    return isDark(this.d().sidebarColor);
  }

  protected resetToTemplate(): void {
    const id = this.store.templateId();
    if (!id) return;
    this.templates.get(id).subscribe({
      next: (template) => {
        this.store.replaceDesign(template.config, template.id);
        this.toast.success('Design reset to the template defaults');
      },
      error: () => this.toast.error('Could not load the template'),
    });
  }
}
