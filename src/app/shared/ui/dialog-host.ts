import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DialogService } from '../../core/services/ui.service';

// Plain value/input bindings instead of ngModel: this host is part of the start-up bundle, and
// FormsModule would pull @angular/forms (~35 kB) into it for two fields.
@Component({
  selector: 'app-dialog-host',
  template: `
    @if (dialogs.current(); as dialog) {
      <div class="modal-backdrop" animate.leave="is-leaving" (click)="cancel()" (keydown.escape)="cancel()">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
          <div class="modal-body dialog-body">
            <span class="dialog-ic" [class.danger]="dialog.danger" aria-hidden="true">
              <span class="i">{{ dialog.danger ? 'delete_forever' : dialog.kind === 'prompt' ? 'edit' : 'help' }}</span>
            </span>
            <div class="dialog-text stack">
              <h3>{{ dialog.title }}</h3>
              @if (dialog.message) {
                <p class="muted">{{ dialog.message }}</p>
              }
              @if (dialog.kind === 'prompt') {
                <div class="field">
                  @if (dialog.label) {
                    <label for="dialog-input">{{ dialog.label }}</label>
                  }
                  @if (dialog.multiline) {
                    <textarea #input id="dialog-input" class="textarea" rows="5" [placeholder]="dialog.placeholder ?? ''"
                      [value]="value()" (input)="value.set(input.value)"></textarea>
                  } @else {
                    <input #input id="dialog-input" class="input" [placeholder]="dialog.placeholder ?? ''"
                      [value]="value()" (input)="value.set(input.value)" (keydown.enter)="confirm()" />
                  }
                </div>
              }
            </div>
            <button class="btn btn-ghost btn-icon btn-sm close" type="button" (click)="cancel()" aria-label="Close">
              <span class="i">close</span>
            </button>
          </div>
          <div class="modal-footer">
            <button class="btn" type="button" (click)="cancel()">{{ dialog.cancelText ?? 'Cancel' }}</button>
            <button class="btn" type="button" [class.btn-danger]="dialog.danger" [class.btn-primary]="!dialog.danger" (click)="confirm()">
              {{ dialog.confirmText ?? (dialog.kind === 'prompt' ? 'Save' : 'Confirm') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .modal { width: min(500px, 100%); }
    .dialog-body { position: relative; display: flex; gap: 16px; padding: 24px 22px 22px; }
    .dialog-text { flex: 1; min-width: 0; gap: 10px; }
    .dialog-text h3 { font-size: 17px; padding-right: 28px; }
    .dialog-ic {
      width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0; display: grid; place-items: center;
      color: var(--primary-700); background: var(--primary-50); border: 1px solid var(--primary-100);
      animation: dialog-ic-in 0.6s var(--ease-spring) 0.12s both;
    }
    .dialog-ic.danger { color: var(--danger); background: var(--danger-50); border-color: var(--danger-line); }
    .dialog-ic .i { font-size: 22px; }
    .close { position: absolute; top: 14px; right: 14px; }
    @keyframes dialog-ic-in { from { opacity: 0; transform: scale(0.4) rotate(-25deg); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogHost {
  protected readonly dialogs = inject(DialogService);
  protected readonly value = signal('');
  private readonly input = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('input');

  constructor() {
    effect(() => {
      const dialog = this.dialogs.current();
      this.value.set(dialog?.value ?? '');
    });
    effect(() => {
      const input = this.input();
      if (input) setTimeout(() => input.nativeElement.select(), 30);
    });
  }

  protected confirm(): void {
    const dialog = this.dialogs.current();
    if (!dialog) return;
    this.dialogs.close(dialog.kind === 'prompt' ? this.value().trim() : true);
  }

  protected cancel(): void {
    const dialog = this.dialogs.current();
    this.dialogs.close(dialog?.kind === 'prompt' ? null : false);
  }
}
