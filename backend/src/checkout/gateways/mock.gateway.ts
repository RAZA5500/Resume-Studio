import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  type CheckoutUrls,
  field,
  type GatewayOrder,
  type GatewayOutcome,
  type GatewayRequest,
  type GatewayResult,
  type GatewaySession,
  type PaymentGateway,
} from './gateway.types.js';

type MockOutcome = Exclude<GatewayOutcome, 'pending'>;

const MESSAGES: Record<MockOutcome, string | undefined> = {
  paid: undefined,
  failed: 'The test card was declined.',
  cancelled: 'You cancelled the payment.',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Built-in stand-in for a real gateway (PAYMENT_GATEWAY=mock), for development and demos. Its
 * "hosted payment page" is served by this API and posts HMAC-signed results back exactly like a
 * real hosted checkout, so the whole flow — return URL, verification, fulfilment — runs for real.
 * Refused when NODE_ENV=production: anyone could unlock lifetime access with it.
 */
export class MockGateway implements PaymentGateway {
  readonly key = 'mock';
  readonly name = 'Test gateway';
  readonly brands = ['Test card', 'Test wallet'];
  readonly testMode = true;

  /** Per process: pages signed before a restart stop verifying, which is fine for a test gateway. */
  private readonly secret = randomBytes(32);

  constructor(private readonly siteUrl: string) {}

  createSession(order: GatewayOrder): Promise<GatewaySession> {
    return Promise.resolve({
      action: { kind: 'redirect', url: `${this.siteUrl}/api/checkout/mock/${order.id}` },
      reference: `MOCK-${order.id.slice(0, 8).toUpperCase()}`,
    });
  }

  verifyReturn(request: GatewayRequest): Promise<GatewayResult | null> {
    // Buttons on the test page POST their fields; a GET return carries them in the query string.
    const source = field(request.body, 'signature') ? request.body : request.query;
    return Promise.resolve(this.parse(source));
  }

  verifyWebhook(request: GatewayRequest): Promise<GatewayResult | null> {
    return Promise.resolve(this.parse(request.body));
  }

  /** The signed fields a gateway would send back for this outcome. */
  fields(order: Pick<GatewayOrder, 'id' | 'amount' | 'currency'>, outcome: MockOutcome): Record<string, string> {
    const values = {
      order_id: order.id,
      outcome,
      transaction_id: outcome === 'paid' ? `MOCK${randomInt(1_000_000_000, 9_999_999_999)}` : '',
      amount: String(order.amount),
      currency: order.currency,
    };
    return { ...values, signature: this.sign(values) };
  }

  /** The test "hosted payment page". */
  page(order: GatewayOrder, urls: CheckoutUrls): string {
    const amount = `${escapeHtml(order.currency)} ${order.amount.toLocaleString('en-US')}`;
    const form = (outcome: MockOutcome, label: string, className: string) => {
      const inputs = Object.entries(this.fields(order, outcome))
        .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
        .join('');
      return `<form method="post" action="${escapeHtml(urls.returnUrl)}">${inputs}<button class="${className}" type="submit">${label}</button></form>`;
    };
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Test payment · ResumeStudio</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #eef2f7; }
  main { width: min(420px, 100%); background: #fff; border-radius: 20px; padding: 28px 24px;
    box-shadow: 0 24px 60px -28px rgba(15, 23, 42, 0.45); }
  .test { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase; color: #92400e; background: #fef3c7; }
  .merchant { margin: 18px 0 0; font-weight: 600; color: #475569; }
  h1 { margin: 2px 0 0; font-size: 34px; letter-spacing: -0.03em; }
  .desc { margin: 0; color: #475569; }
  dl { margin: 18px 0 22px; padding: 14px 0 0; border-top: 1px solid #e2e8f0; display: grid; gap: 6px; font-size: 13px; }
  dl div { display: flex; justify-content: space-between; gap: 12px; }
  dt { color: #64748b; } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; text-align: right; }
  form { margin: 0 0 10px; }
  button { width: 100%; height: 46px; border-radius: 12px; border: 0; font: inherit; font-weight: 700; cursor: pointer; }
  .pay { color: #fff; background: #2563eb; }
  .pay:hover { background: #1d4ed8; }
  .decline { color: #b91c1c; background: #fee2e2; }
  .cancel { height: 40px; color: #475569; background: none; font-weight: 600; }
  .note { margin: 14px 0 0; font-size: 12px; color: #64748b; text-align: center; }
</style>
</head>
<body>
<main>
  <span class="test">Test mode · no real money moves</span>
  <p class="merchant">ResumeStudio</p>
  <h1>${amount}</h1>
  <p class="desc">${escapeHtml(order.description)}</p>
  <dl>
    <div><dt>Order</dt><dd>${escapeHtml(order.id.slice(0, 8).toUpperCase())}</dd></div>
    <div><dt>Customer</dt><dd>${escapeHtml(order.customer.email)}</dd></div>
  </dl>
  ${form('paid', `Pay ${amount}`, 'pay')}
  ${form('failed', 'Simulate a declined payment', 'decline')}
  ${form('cancelled', 'Cancel and go back', 'cancel')}
  <p class="note">This page stands in for the real payment gateway (PAYMENT_GATEWAY=mock).</p>
</main>
</body>
</html>`;
  }

  private parse(source: unknown): GatewayResult | null {
    const values = {
      order_id: field(source, 'order_id') ?? '',
      outcome: field(source, 'outcome') ?? '',
      transaction_id: field(source, 'transaction_id') ?? '',
      amount: field(source, 'amount') ?? '',
      currency: field(source, 'currency') ?? '',
    };
    const signature = field(source, 'signature') ?? '';
    if (!values.order_id || !(values.outcome in MESSAGES) || !/^\d+$/.test(values.amount)) return null;
    const expected = Buffer.from(this.sign(values), 'hex');
    const given = Buffer.from(signature, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const outcome = values.outcome as MockOutcome;
    return {
      orderId: values.order_id,
      outcome,
      transactionId: values.transaction_id || undefined,
      amount: Number(values.amount),
      currency: values.currency,
      payer: outcome === 'paid' ? 'Test card •••• 4242' : undefined,
      message: MESSAGES[outcome],
    };
  }

  private sign(values: Record<'order_id' | 'outcome' | 'transaction_id' | 'amount' | 'currency', string>): string {
    const message = [values.order_id, values.outcome, values.transaction_id, values.amount, values.currency].join('|');
    return createHmac('sha256', this.secret).update(message).digest('hex');
  }
}
