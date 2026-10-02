import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-file-drop',
  template: `
    <div class="dropzone" [class.dragging]="dragging()" [class.compact]="compact()"
      (click)="input.click()" (keydown.enter)="input.click()" tabindex="0" role="button"
      (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
      <span class="ic"><span class="i">{{ icon() }}</span></span>
      <div class="title">{{ dragging() ? 'Drop it here' : title() }}</div>
      <div class="hint">{{ hint() }}</div>
      <input #input type="file" hidden [accept]="accept()" [multiple]="multiple()" (change)="onPick(input)" />
    </div>
  `,
  styles: `
    :host { display: block; }
    .ic {
      display: inline-grid; place-items: center; width: 58px; height: 58px; margin-bottom: 14px;
      border-radius: 18px; color: #fff; background: var(--grad-brand); background-size: 200% 200%;
      box-shadow: 0 14px 34px -12px rgba(37, 99, 235, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.3);
      animation: float-y 4s var(--ease-in-out) infinite, gradient-pan 6s ease-in-out infinite;
      transition: scale 0.4s var(--ease-spring), rotate 0.4s var(--ease-spring);
    }
    .ic .i { font-size: 28px; }
    .dropzone:hover .ic, .dragging .ic { scale: 1.1; rotate: -8deg; }
    .title { font-weight: 700; font-size: 15.5px; color: var(--text); }
    .hint { color: var(--text-3); font-size: 12.5px; margin-top: 5px; }
    .compact { padding: 20px; }
    .compact .ic { width: 46px; height: 46px; border-radius: 14px; margin-bottom: 10px; }
    .compact .ic .i { font-size: 23px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileDrop {
  readonly accept = input('*/*');
  readonly multiple = input(false);
  readonly compact = input(false);
  readonly icon = input('upload_file');
  readonly title = input('Drop your file here or click to browse');
  readonly hint = input('PDF, DOCX, images and more — up to 25 MB');
  readonly files = output<File[]>();

  protected readonly dragging = signal(false);

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) this.files.emit(this.multiple() ? files : files.slice(0, 1));
  }

  protected onPick(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) this.files.emit(files);
  }
}
