import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AiService } from './core/services/ai.service';
import { apiReady } from './core/services/api-url.interceptor';
import { AuthService } from './core/services/auth.service';
import { BillingService } from './core/services/billing.service';
import { DialogHost } from './shared/ui/dialog-host';
import { Toasts } from './shared/ui/toasts';
import { UpgradeDialog } from './shared/ui/upgrade-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts, DialogHost, UpgradeDialog],
  template: `
    <router-outlet />
    <app-toasts />
    <app-dialog-host />
    <app-upgrade-dialog />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly ai = inject(AiService);
  private readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);

  ngOnInit(): void {
    // An Android test build without a server yet loads these after the Connect page.
    if (!apiReady()) return;
    this.ai.loadStatus();
    this.billing.loadConfig();
    if (this.auth.isAuthenticated()) {
      this.auth.refreshProfile().subscribe({ error: () => undefined });
      this.billing.refresh(true);
    }
  }
}
