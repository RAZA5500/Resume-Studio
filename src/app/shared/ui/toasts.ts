import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/ui.service';

const ICONS = { success: 'check_circle', error: 'error', info: 'info', warning: 'warning' };

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [attr.data-type]="toast.type" role="status" animate.leave="is-leaving">
          <span class="ic"><span class="i fill">{{ icons[toast.type] }}</span></span>
          <p>{{ toast.message }}</p>
          <button type="button" (click)="toasts.dismiss(toast.id)" aria-label="Dismiss"><span class="i sm">close</span></button>
          <span class="timer" [style.animation-duration.ms]="toast.duration"></span>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed; right: 20px; bottom: 20px; z-index: 2000;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
      width: min(420px, calc(100vw - 32px)); pointer-events: none;
    }
    .toast {
      --tone: var(--primary);
      position: relative; overflow: hidden; pointer-events: auto;
      display: flex; align-items: flex-start; gap: 11px; width: 100%;
      padding: 12px 10px 14px 12px; border-radius: 16px;
      background: var(--surface-glass); color: var(--text);
      border: 1px solid var(--border-strong);
      backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
      box-shadow: var(--shadow-lg), 0 0 0 1px rgba(0, 0, 0, 0.04);
      font-size: 13.5px; font-weight: 500;
      animation: toast-in 0.55s var(--ease-spring) both;
    }
    .toast.is-leaving { animation: toast-out 0.3s var(--ease) both; }
    .toast[data-type='success'] { --tone: var(--success); }
    .toast[data-type='error'] { --tone: var(--danger); }
    .toast[data-type='warning'] { --tone: var(--warning); }
    .toast[data-type='info'] { --tone: var(--info); }
    .ic {
      width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center;
      color: var(--tone); background: color-mix(in srgb, var(--tone) 16%, transparent);
      box-shadow: 0 0 22px -4px color-mix(in srgb, var(--tone) 70%, transparent);
    }
    .ic .i { font-size: 19px; animation: icon-pop 0.6s var(--ease-spring) 0.1s both; }
    p { flex: 1; padding-top: 5px; line-height: 1.45; }
    button {
      border: 0; background: transparent; color: var(--text-3); cursor: pointer; padding: 4px; display: flex;
      border-radius: 8px; transition: color 0.2s, background 0.2s, transform 0.3s var(--ease-spring);
    }
    button:hover { color: var(--text); background: var(--surface-3); transform: rotate(90deg); }
    .timer {
      position: absolute; left: 0; bottom: 0; height: 2px; width: 100%;
      background: linear-gradient(90deg, var(--tone), color-mix(in srgb, var(--tone) 40%, transparent));
      transform-origin: left; animation: countdown linear both;
    }
    @keyframes toast-in { from { opacity: 0; transform: translateX(40px) scale(0.92); filter: blur(6px); } }
    @keyframes toast-out { to { opacity: 0; transform: translateX(60px) scale(0.95); } }
    @keyframes icon-pop { from { transform: scale(0) rotate(-45deg); } }
    @keyframes countdown { to { transform: scaleX(0); } }
    @media (max-width: 600px) {
      .toasts { right: 16px; left: 16px; bottom: 16px; width: auto; align-items: stretch; }
      @keyframes toast-in { from { opacity: 0; transform: translateY(30px) scale(0.95); } }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
  protected readonly icons = ICONS;
}
