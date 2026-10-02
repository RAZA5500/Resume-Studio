import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { apiOrigin, saveServerOrigin } from '../../core/services/api-url.interceptor';
import { Logo } from '../../shared/ui/logo';

/**
 * Shown only by an Android build made without API_URL (a test build): asks for the backend
 * address once, checks it with /api/health and keeps it on the phone.
 */
@Component({
  selector: 'app-connect-page',
  imports: [FormsModule, Logo],
  template: `
    <main class="connect">
      <div class="card connect-card">
        <app-logo />
        <h1>Connect to your server</h1>
        <p class="muted">
          This test version of the app has no server address built in. Enter the address of your ResumeStudio
          backend — your website, or your computer on the same Wi-Fi.
        </p>
        <form class="stack" (ngSubmit)="connect()" novalidate>
          <div class="field">
            <label for="server">Server address</label>
            <input id="server" class="input" name="server" type="url" inputmode="url" autocomplete="url"
              autocapitalize="off" spellcheck="false" placeholder="https://your-domain.com"
              [ngModel]="address()" (ngModelChange)="address.set($event)" />
          </div>
          @if (error()) {
            <div class="alert danger"><span class="i">error</span> {{ error() }}</div>
          }
          <button class="btn btn-primary btn-block" type="submit" [disabled]="checking() || !address().trim()">
            @if (checking()) {
              <span class="spinner"></span> Checking…
            } @else {
              Connect
            }
          </button>
        </form>
        <p class="hint">
          Testing with the backend on your computer? "localhost" means the phone itself here — use the computer's
          network address instead (run <code>ipconfig</code>), for example <code>http://192.168.1.5:3000</code>.
        </p>
      </div>
    </main>
  `,
  styles: `
    .connect { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); }
    .connect-card { width: min(440px, 100%); padding: 28px 24px; display: grid; gap: 14px; }
    h1 { font-size: 24px; margin-top: 6px; }
    .hint { font-size: 12.5px; color: var(--text-3); line-height: 1.6; }
    code { font-size: 12px; background: var(--surface-3); padding: 1px 5px; border-radius: 5px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>('');

  protected readonly address = signal(apiOrigin());
  protected readonly checking = signal(false);
  protected readonly error = signal('');

  protected async connect(): Promise<void> {
    const origin = normalize(this.address());
    if (!origin) {
      this.error.set('Enter an address like https://your-domain.com');
      return;
    }
    this.checking.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.get(`${origin}/api/health`).pipe(timeout(10000)));
      saveServerOrigin(origin);
      await this.router.navigateByUrl(this.returnUrl() || '/login', { replaceUrl: true });
    } catch {
      this.error.set(`No ResumeStudio server answered at ${origin}. Check the address and that the backend is running.`);
    } finally {
      this.checking.set(false);
    }
  }
}

/** "192.168.1.5:3000" → "http://192.168.1.5:3000", "example.com/api/" → "https://example.com". */
function normalize(value: string): string {
  let text = value.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) {
    const local = /^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/.test(text);
    text = `${local ? 'http' : 'https'}://${text}`;
  }
  try {
    return new URL(text).origin;
  } catch {
    return '';
  }
}
