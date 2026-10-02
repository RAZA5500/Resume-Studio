import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BillingService, UpgradeService } from '../../core/services/billing.service';

const TITLES: Record<string, string> = {
  resume: "You've used today's free resume",
  cover_letter: "You've used today's free cover letter",
  document: "You've used today's free document edit",
};

@Component({
  selector: 'app-upgrade-dialog',
  imports: [DatePipe],
  template: `
    @if (upgrade.reason(); as reason) {
      <div class="modal-backdrop" animate.leave="is-leaving" (click)="upgrade.close()">
        <div class="modal up" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="hero">
            <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
            <button class="btn btn-ghost btn-icon btn-sm close" type="button" (click)="upgrade.close()" aria-label="Close">
              <span class="i">close</span>
            </button>
            <span class="crown" aria-hidden="true"><span class="i fill">workspace_premium</span></span>
            <h3>{{ title() }}</h3>
            <p>{{ reason.message || 'Go lifetime once and keep creating — no daily limits, ever.' }}</p>
          </div>
          <div class="modal-body stack">
            <div class="plans">
              <div class="plan">
                <div class="plan-name">Free <span>PKR 0</span></div>
                <ul>
                  <li><span class="i sm">remove</span> 1 new resume per day</li>
                  <li><span class="i sm">remove</span> 1 cover letter per day</li>
                  <li><span class="i sm">remove</span> 1 document edit per day</li>
                </ul>
              </div>
              <div class="plan featured border-anim">
                <div class="plan-name">Lifetime <span class="price">PKR {{ billing.price() }}</span></div>
                <ul>
                  <li><span class="i sm">check</span> Unlimited resumes</li>
                  <li><span class="i sm">check</span> Unlimited cover letters</li>
                  <li><span class="i sm">check</span> Unlimited document edits</li>
                </ul>
              </div>
            </div>
            <p class="small subtle">
              One-time payment — scan our QR code with JazzCash, Easypaisa or any bank app. No subscription.
              @if (reason.resetsAt) {
                Free limits reset at {{ reason.resetsAt | date: 'h:mm a' }}.
              }
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" type="button" (click)="upgrade.close()">Maybe later</button>
            <button class="btn btn-primary" type="button" (click)="goToCheckout()"><span class="i">bolt</span> Get lifetime access</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .up { width: min(560px, 100%); }
    .hero {
      position: relative; overflow: hidden; padding: 30px 24px 22px; text-align: center;
      border-bottom: 1px solid var(--border);
      background: radial-gradient(circle at 50% -20%, rgba(37, 99, 235, 0.35), transparent 70%);
    }
    .hero > :not(.aurora) { position: relative; z-index: 1; }
    .close { position: absolute !important; top: 12px; right: 12px; }
    .crown {
      display: inline-grid; place-items: center; width: 58px; height: 58px; margin-bottom: 14px;
      border-radius: 18px; color: #fff; background: var(--grad-warm);
      box-shadow: 0 16px 40px -12px rgba(249, 115, 22, 0.8);
      animation: crown-in 0.8s var(--ease-spring) 0.1s both, float-y 4s var(--ease-in-out) 1s infinite;
    }
    .crown .i { font-size: 30px; }
    h3 { font-size: 20px; font-family: var(--font-display); letter-spacing: -0.03em; }
    .hero p { margin-top: 6px; color: var(--text-2); }
    .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .plan { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; background: var(--input-bg); }
    .plan.featured { border-color: transparent; background: var(--primary-50); box-shadow: var(--glow); }
    .plan-name { font-weight: 700; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .plan-name span { font-size: 13px; color: var(--text-3); }
    .plan-name .price { font-size: 15px; font-weight: 800; color: var(--primary-700); }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: var(--text-2); }
    li { display: flex; align-items: center; gap: 7px; }
    .featured li { color: var(--text); }
    .featured .i { color: var(--success); }
    @keyframes crown-in { from { opacity: 0; transform: scale(0.3) rotate(-30deg); } }
    @media (max-width: 520px) { .plans { grid-template-columns: 1fr; } }
  `,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradeDialog {
  protected readonly upgrade = inject(UpgradeService);
  protected readonly billing = inject(BillingService);
  private readonly router = inject(Router);

  protected readonly title = computed(() => {
    const kind = this.upgrade.reason()?.kind;
    return (kind && TITLES[kind]) || 'Upgrade to Lifetime';
  });

  protected goToCheckout(): void {
    this.upgrade.close();
    void this.router.navigateByUrl('/app/billing');
  }

  protected onEscape(): void {
    if (this.upgrade.reason()) this.upgrade.close();
  }
}
