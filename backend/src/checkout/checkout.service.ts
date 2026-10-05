import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillingConfigService } from '../billing/billing-config.service.js';
import { Payment } from '../billing/payment.entity.js';
import { User } from '../users/user.entity.js';
import { CheckoutOrder, type CheckoutOrderStatus } from './checkout-order.entity.js';
import { PAYMENT_GATEWAY, siteUrlFrom } from './gateways/gateway.registry.js';
import {
  type CheckoutUrls,
  field,
  type GatewayOrder,
  type GatewayRequest,
  type GatewayResult,
  type PaymentGateway,
} from './gateways/gateway.types.js';
import { MockGateway } from './gateways/mock.gateway.js';

/** How long a buyer has to finish on the gateway's page before the order counts as expired. */
const ORDER_MINUTES = 30;
/** Result pages poll the order; the gateway's status API is asked at most this often per order. */
const STATUS_CHECK_MS = 4_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESCRIPTION = 'ResumeStudio lifetime access';

export type CheckoutOrderState = CheckoutOrderStatus | 'expired';

export interface CheckoutOrderView {
  id: string;
  status: CheckoutOrderState;
  plan: string;
  amount: number;
  currency: string;
  provider: string;
  providerName: string;
  testMode: boolean;
  transactionId: string | null;
  failureReason: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  createdAt: Date;
}

/** What a browser-facing endpoint answers with: a redirect, or a small page with its own CSP. */
export type CheckoutPage = { redirect: string } | { html: string; csp: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Online checkout through the payment gateway (the primary way to pay; the QR code with manual
 * approval stays in BillingService). A purchase is an order: created here, paid on the gateway's
 * page, and confirmed by the gateway's signed return data, webhook or status API — whichever
 * arrives first. Fulfilment is idempotent, so the others are harmless repeats.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger('Checkout');
  private readonly siteUrl: string;
  private readonly lastStatusCheck = new Map<string, number>();

  constructor(
    @InjectRepository(CheckoutOrder) private readonly orders: Repository<CheckoutOrder>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly billing: BillingConfigService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway | null,
    config: ConfigService,
  ) {
    this.siteUrl = siteUrlFrom(config);
  }

  publicConfig() {
    const gateway = this.gateway;
    return {
      price: this.billing.price,
      currency: this.billing.currency,
      gateway: gateway ? { key: gateway.key, name: gateway.name, brands: gateway.brands, testMode: gateway.testMode } : null,
      orderMinutes: ORDER_MINUTES,
    };
  }

  /** Creates an order and its gateway session; the app then opens payUrl. */
  async create(userId: string): Promise<{ order: CheckoutOrderView; payUrl: string }> {
    const gateway = this.gateway;
    if (!gateway) throw new ServiceUnavailableException('Online payment is not available yet. Please pay with the QR code.');
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Account not found');
    if (user.plan === 'lifetime') throw new BadRequestException('You already have lifetime access.');

    const order = await this.orders.save(
      this.orders.create({
        userId,
        plan: 'lifetime',
        amount: this.billing.price,
        currency: this.billing.currency,
        provider: gateway.key,
        status: 'created',
        providerRef: null,
        transactionId: null,
        paymentId: null,
        failureReason: null,
        expiresAt: new Date(Date.now() + ORDER_MINUTES * 60_000),
        paidAt: null,
      }),
    );
    try {
      const session = await gateway.createSession(this.gatewayOrder(order, user), this.urls(order));
      order.providerRef = session.reference?.slice(0, 120) ?? null;
      await this.orders.update({ id: order.id }, { providerRef: order.providerRef, action: session.action });
    } catch (error) {
      this.logger.error(`${gateway.name} could not start a payment for order ${order.id}: ${(error as Error).message}`);
      await this.orders.update({ id: order.id }, { status: 'failed', failureReason: 'The payment gateway did not respond.' });
      throw new BadGatewayException(
        'The payment gateway is not responding right now. Please try again in a minute, or pay with the QR code.',
      );
    }
    return { order: this.view(order), payUrl: `${this.siteUrl}/api/checkout/orders/${order.id}/pay` };
  }

  /** Current state of an order; an open one is first checked with the gateway (when it has a status API). */
  async status(id: string): Promise<CheckoutOrderView> {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException('Order not found');
    return this.view(order.status === 'created' ? ((await this.syncWithGateway(order)) ?? order) : order);
  }

  /** GET orders/:id/pay: sends the browser on to the gateway's payment page. */
  async launch(id: string): Promise<CheckoutPage> {
    const order = await this.orders
      .createQueryBuilder('o')
      .addSelect('o.action')
      .where('o.id = :id', { id })
      .getOne();
    if (!order) return { redirect: this.resultUrl(null) };
    if (order.status !== 'created' || !order.action || order.expiresAt.getTime() < Date.now()) {
      return { redirect: this.resultUrl(order.id) };
    }
    if (!this.gatewayFor(order)) {
      // The gateway was switched since the order was made, so its callbacks could not be checked.
      await this.orders.update(
        { id: order.id, status: 'created' },
        { status: 'failed', failureReason: 'Online payment was changed. Please start again.' },
      );
      return { redirect: this.resultUrl(order.id) };
    }

    const action = order.action;
    if (action.kind === 'redirect') return { redirect: action.url };
    // Gateways that expect a form POST: an auto-submitting form (with a button when scripts are off).
    const nonce = randomBytes(16).toString('base64');
    const inputs = Object.entries(action.fields)
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
      .join('');
    return {
      csp: `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action 'self' https: ${new URL(action.url).origin}; base-uri 'none'; frame-ancestors 'none'`,
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Opening secure payment…</title></head>
<body style="font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#334155">
<form id="pay" method="post" action="${escapeHtml(action.url)}">${inputs}<p>Opening the secure payment page…</p><noscript><button type="submit">Continue to payment</button></noscript></form>
<script nonce="${nonce}">document.getElementById('pay').submit();</script>
</body></html>`,
    };
  }

  /** GET/POST return/:provider: verifies what came back with the buyer, then opens the result page. */
  async handleReturn(provider: string, request: GatewayRequest): Promise<string> {
    const orderParam = field(request.query, 'order');
    const orderId = orderParam && UUID.test(orderParam) ? orderParam : null;
    const gateway = this.gateway?.key === provider ? this.gateway : null;
    if (!gateway) {
      this.logger.warn(`Return from "${provider}", which is not the active gateway (order ${orderId ?? 'unknown'}).`);
      return this.resultUrl(orderId);
    }

    let result: GatewayResult | null = null;
    try {
      result = await gateway.verifyReturn(request);
    } catch (error) {
      this.logger.warn(`${gateway.name} return could not be verified: ${(error as Error).message}`);
    }
    if (result) {
      await this.apply(gateway, result, 'return');
      return this.resultUrl(UUID.test(result.orderId) ? result.orderId : orderId);
    }
    if (orderId) {
      const order = await this.orders.findOneBy({ id: orderId, provider: gateway.key });
      if (order?.status === 'created') {
        // No signed data: ask the gateway directly. A buyer who pressed cancel gives up the order,
        // though a payment the gateway confirms later still counts.
        const synced = await this.syncWithGateway(order, true);
        if (synced?.status === 'created' && field(request.query, 'cancelled') === '1') {
          await this.orders.update(
            { id: order.id, status: 'created' },
            { status: 'cancelled', failureReason: 'You cancelled the payment.' },
          );
        }
      }
    }
    return this.resultUrl(orderId);
  }

  /** POST webhook/:provider: the gateway's server-to-server notification. */
  async handleWebhook(provider: string, request: GatewayRequest): Promise<void> {
    const gateway = this.gateway;
    if (!gateway || gateway.key !== provider) throw new NotFoundException('Unknown payment gateway');
    let result: GatewayResult | null = null;
    try {
      result = await gateway.verifyWebhook(request);
    } catch (error) {
      this.logger.warn(`${gateway.name} webhook could not be verified: ${(error as Error).message}`);
    }
    if (!result) throw new BadRequestException('The notification could not be verified.');
    await this.apply(gateway, result, 'webhook');
  }

  /** The test gateway's payment page (PAYMENT_GATEWAY=mock only). */
  async mockPage(id: string): Promise<CheckoutPage> {
    const gateway = this.gateway;
    if (!(gateway instanceof MockGateway)) throw new NotFoundException();
    const order = await this.orders.findOneBy({ id, provider: gateway.key });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'created') return { redirect: this.resultUrl(order.id) };
    const user = await this.users.findOneBy({ id: order.userId });
    const { returnUrl } = this.urls(order);
    return {
      html: gateway.page(this.gatewayOrder(order, user), this.urls(order)),
      csp: `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(returnUrl).origin}; base-uri 'none'; frame-ancestors 'none'`,
    };
  }

  /** Applies a verified gateway result. Safe to repeat: return data, webhooks and status checks overlap. */
  async apply(gateway: PaymentGateway, result: GatewayResult, source: string): Promise<CheckoutOrder | null> {
    if (!UUID.test(result.orderId)) {
      this.logger.warn(`${gateway.name} ${source} named an invalid order id "${result.orderId}".`);
      return null;
    }
    if (result.outcome === 'paid') return this.fulfil(gateway, result, source);

    const order = await this.orders.findOneBy({ id: result.orderId, provider: gateway.key });
    if (!order || result.outcome === 'pending' || order.status !== 'created') return order;
    const failureReason = (
      result.message || (result.outcome === 'cancelled' ? 'The payment was cancelled.' : 'The payment did not go through.')
    ).slice(0, 300);
    // Only an open order changes: a paid order never goes back to failed.
    await this.orders.update({ id: order.id, status: 'created' }, { status: result.outcome, failureReason });
    return { ...order, status: result.outcome, failureReason };
  }

  private async fulfil(gateway: PaymentGateway, result: GatewayResult, source: string): Promise<CheckoutOrder | null> {
    const { order, granted } = await this.dataSource.transaction(async (manager) => {
      // The row lock makes a webhook and a return that arrive together take turns.
      const order = await manager.findOne(CheckoutOrder, { where: { id: result.orderId }, lock: { mode: 'pessimistic_write' } });
      if (!order || order.provider !== gateway.key || order.status === 'paid') return { order, granted: false };

      const amountMismatch = result.amount !== undefined && result.amount !== order.amount;
      const currencyMismatch = !!result.currency && result.currency.toUpperCase() !== order.currency;
      if (amountMismatch || currencyMismatch) {
        order.status = 'failed';
        order.failureReason = `The gateway reported ${result.currency ?? order.currency} ${result.amount ?? order.amount} instead of ${order.currency} ${order.amount}. Contact support.`;
        await manager.update(CheckoutOrder, { id: order.id }, { status: order.status, failureReason: order.failureReason });
        this.logger.error(`Order ${order.id}: ${order.failureReason} (${source}, transaction ${result.transactionId ?? '—'})`);
        return { order, granted: false };
      }

      const now = new Date();
      const transactionId = (result.transactionId?.trim() || order.id).slice(0, 64);
      const payment = await manager.save(
        manager.create(Payment, {
          userId: order.userId,
          plan: order.plan,
          amount: order.amount,
          currency: order.currency,
          method: 'gateway',
          provider: gateway.key,
          transactionId,
          senderNumber: result.payer?.trim().slice(0, 40) || null,
          senderName: null,
          screenshotKey: null,
          hasScreenshot: false,
          status: 'approved',
          adminNote: null,
          reviewedBy: `${gateway.name} (automatic)`,
          reviewedAt: now,
        }),
      );
      Object.assign(order, { status: 'paid', paidAt: now, transactionId, paymentId: payment.id, failureReason: null });
      await manager.update(
        CheckoutOrder,
        { id: order.id },
        { status: 'paid', paidAt: now, transactionId, paymentId: payment.id, failureReason: null },
      );
      // Users who already have lifetime access (e.g. an admin granted it meanwhile) keep their date.
      await manager.update(User, { id: order.userId, plan: 'free' }, { plan: 'lifetime', planActivatedAt: now });
      return { order, granted: true };
    });
    if (granted && order) {
      this.logger.log(`Order ${order.id} paid via ${gateway.name} (${source}, transaction ${order.transactionId}); lifetime access activated.`);
    }
    return order;
  }

  /** Asks the gateway about an open order (rate limited per order unless forced). */
  private async syncWithGateway(order: CheckoutOrder, force = false): Promise<CheckoutOrder | null> {
    const gateway = this.gatewayFor(order);
    if (!gateway?.fetchStatus) return null;
    const now = Date.now();
    if (!force && now - (this.lastStatusCheck.get(order.id) ?? 0) < STATUS_CHECK_MS) return null;
    this.lastStatusCheck.set(order.id, now);
    if (this.lastStatusCheck.size > 1000) {
      for (const [id, at] of this.lastStatusCheck) if (now - at > 60_000) this.lastStatusCheck.delete(id);
    }
    try {
      const user = await this.users.findOneBy({ id: order.userId });
      const result = await gateway.fetchStatus(this.gatewayOrder(order, user));
      if (!result || result.orderId !== order.id) return null;
      return await this.apply(gateway, result, 'status check');
    } catch (error) {
      this.logger.warn(`${gateway.name} status check for order ${order.id} failed: ${(error as Error).message}`);
      return null;
    }
  }

  private gatewayFor(order: Pick<CheckoutOrder, 'provider'>): PaymentGateway | null {
    return this.gateway?.key === order.provider ? this.gateway : null;
  }

  private gatewayOrder(order: CheckoutOrder, user: Pick<User, 'email' | 'fullName'> | null): GatewayOrder {
    return {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      description: DESCRIPTION,
      customer: { email: user?.email ?? '', name: user?.fullName ?? '' },
      reference: order.providerRef,
    };
  }

  private urls(order: Pick<CheckoutOrder, 'id' | 'provider'>): CheckoutUrls {
    const returnUrl = `${this.siteUrl}/api/checkout/return/${order.provider}?order=${order.id}`;
    return {
      returnUrl,
      cancelUrl: `${returnUrl}&cancelled=1`,
      webhookUrl: `${this.siteUrl}/api/checkout/webhook/${order.provider}`,
    };
  }

  private resultUrl(orderId: string | null): string {
    return `${this.siteUrl}/checkout/result${orderId ? `?order=${orderId}` : ''}`;
  }

  private view(order: CheckoutOrder): CheckoutOrderView {
    const gateway = this.gatewayFor(order);
    const expired = order.status === 'created' && order.expiresAt.getTime() < Date.now();
    return {
      id: order.id,
      status: expired ? 'expired' : order.status,
      plan: order.plan,
      amount: order.amount,
      currency: order.currency,
      provider: order.provider,
      providerName: gateway?.name ?? order.provider,
      testMode: gateway?.testMode ?? false,
      transactionId: order.transactionId,
      failureReason: order.failureReason,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
    };
  }
}
