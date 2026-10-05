import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { PublicHeader } from '../../layout/public-header/public-header';

/**
 * Public privacy policy (/privacy). Google and Apple sign-in need its address on the consent
 * screen, so it stays reachable signed in or not and does not depend on the API being up.
 */
@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, PublicHeader],
  templateUrl: './privacy-page.html',
  styleUrl: './privacy-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);

  protected readonly whatsappLink = computed(() => {
    const number = this.billing.config()?.supportWhatsapp?.replace(/\D/g, '');
    return number ? `https://wa.me/${number}` : null;
  });

  ngOnInit(): void {
    this.billing.loadConfig();
  }
}
