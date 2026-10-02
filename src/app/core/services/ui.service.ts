import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  /** Milliseconds before the toast closes itself (drives the countdown bar). */
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(message: string): void {
    this.show('success', message);
  }

  error(message: string): void {
    if (!message) return;
    this.show('error', message, 6500);
  }

  info(message: string): void {
    this.show('info', message);
  }

  warning(message: string): void {
    this.show('warning', message, 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(type: ToastType, message: string, duration = 3800): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list.slice(-4), { id, type, message, duration }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}

export interface DialogRequest {
  kind: 'confirm' | 'prompt';
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  label?: string;
  value?: string;
  placeholder?: string;
  multiline?: boolean;
  resolve: (value: unknown) => void;
}

type DialogOptions = Omit<DialogRequest, 'kind' | 'resolve'>;

/** Promise based confirm / prompt dialogs rendered by <app-dialog-host>. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogRequest | null>(null);

  confirm(options: DialogOptions): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise((resolve) =>
      this.current.set({ kind: 'confirm', ...options, resolve: (v) => resolve(v === true) }),
    );
  }

  prompt(options: DialogOptions): Promise<string | null> {
    this.current()?.resolve(null);
    return new Promise((resolve) =>
      this.current.set({
        kind: 'prompt',
        ...options,
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
      }),
    );
  }

  close(value: unknown): void {
    const request = this.current();
    this.current.set(null);
    request?.resolve(value);
  }
}
