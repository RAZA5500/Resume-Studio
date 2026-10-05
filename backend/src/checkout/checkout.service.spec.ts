import { randomUUID } from 'node:crypto';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import { BillingConfigService } from '../billing/billing-config.service.js';
import type { Payment } from '../billing/payment.entity.js';
import { User } from '../users/user.entity.js';
import { CheckoutOrder } from './checkout-order.entity.js';
import { CheckoutService } from './checkout.service.js';
import { createGateway } from './gateways/gateway.registry.js';
import { MockGateway } from './gateways/mock.gateway.js';

type Row = Record<string, unknown>;

const quiet = { log: () => undefined, warn: () => undefined, error: () => undefined } as never;

function configOf(env: Record<string, string>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

/** In-memory stand-ins for the repositories and the transaction manager the service uses. */
function setup(options: { gateway?: boolean; plan?: 'free' | 'lifetime' } = {}) {
  const env = { FRONTEND_URL: 'https://resume.example.com', LIFETIME_PRICE_PKR: '99' };
  const gateway = options.gateway === false ? null : new MockGateway('https://resume.example.com');
  const orders: Row[] = [];
  const users: Row[] = [{ id: 'u1', email: 'sara@example.com', fullName: 'Sara Khan', plan: options.plan ?? 'free', planActivatedAt: null }];
  const payments: Row[] = [];
  const tables = new Map<unknown, Row[]>([
    [CheckoutOrder, orders],
    [User, users],
  ]);
  const copy = <T>(row: T | undefined): T | null => (row ? structuredClone(row) : null);

  const orderRepo = {
    create: (data: Row) => ({ ...data }),
    save: (order: Row) => {
      order.id ??= randomUUID();
      order.createdAt ??= new Date();
      orders.push(structuredClone(order));
      return Promise.resolve(order);
    },
    update: (where: Row, patch: Row) => {
      for (const row of orders.filter((r) => matches(r, where))) Object.assign(row, patch);
      return Promise.resolve();
    },
    findOneBy: (where: Row) => Promise.resolve(copy(orders.find((r) => matches(r, where)))),
  } as unknown as Repository<CheckoutOrder>;
  const userRepo = {
    findOneBy: (where: Row) => Promise.resolve(copy(users.find((r) => matches(r, where)))),
  } as unknown as Repository<User>;
  const manager = {
    findOne: (entity: unknown, { where }: { where: Row }) => Promise.resolve(copy(tables.get(entity)?.find((r) => matches(r, where)))),
    update: (entity: unknown, where: Row, patch: Row) => {
      for (const row of (tables.get(entity) ?? []).filter((r) => matches(r, where))) Object.assign(row, patch);
      return Promise.resolve();
    },
    create: (_entity: unknown, data: Row) => ({ ...data }),
    save: (payment: Row) => {
      const saved = { id: randomUUID(), ...payment };
      payments.push(saved);
      return Promise.resolve(saved);
    },
  };
  const dataSource = { transaction: (work: (m: typeof manager) => unknown) => work(manager) } as unknown as DataSource;

  const service = new CheckoutService(
    orderRepo,
    userRepo,
    dataSource,
    new BillingConfigService(configOf(env)),
    gateway,
    configOf(env),
  );
  Object.assign(service, { logger: quiet });
  return { service, gateway, orders, users, payments };
}

/** Starts a checkout and returns the order id plus what the test gateway would post back. */
async function startOrder(ctx: ReturnType<typeof setup>) {
  const { order, payUrl } = await ctx.service.create('u1');
  const signed = (outcome: 'paid' | 'failed' | 'cancelled', amount = order.amount) =>
    ctx.gateway!.fields({ id: order.id, amount, currency: order.currency }, outcome);
  return { order, payUrl, signed };
}

const post = (body: Record<string, string>, query: Record<string, string> = {}) => ({ query, body, headers: {} });

describe('MockGateway', () => {
  const gateway = new MockGateway('https://resume.example.com');
  const order = { id: randomUUID(), amount: 99, currency: 'PKR' };

  it('accepts the fields it signed, from a form post or a query string', async () => {
    const fields = gateway.fields(order, 'paid');
    await expect(gateway.verifyReturn(post(fields))).resolves.toMatchObject({ orderId: order.id, outcome: 'paid', amount: 99, currency: 'PKR' });
    await expect(gateway.verifyReturn({ query: fields, body: {}, headers: {} })).resolves.toMatchObject({ outcome: 'paid' });
    expect(fields.transaction_id).toMatch(/^MOCK\d{10}$/);
  });

  it('rejects tampered or unsigned data', async () => {
    const fields = gateway.fields(order, 'failed');
    await expect(gateway.verifyReturn(post({ ...fields, outcome: 'paid' }))).resolves.toBeNull();
    await expect(gateway.verifyReturn(post({ ...gateway.fields(order, 'paid'), amount: '1' }))).resolves.toBeNull();
    await expect(gateway.verifyReturn(post({ ...fields, signature: 'abc' }))).resolves.toBeNull();
    await expect(gateway.verifyWebhook(post({}))).resolves.toBeNull();
    // Another process (e.g. after a restart) has another secret.
    const other = new MockGateway('https://resume.example.com');
    await expect(other.verifyReturn(post(gateway.fields(order, 'paid')))).resolves.toBeNull();
  });

  it('escapes order details on its payment page', () => {
    const html = gateway.page(
      { ...order, description: 'Lifetime <b>', customer: { email: '"x"@y.z', name: '' }, reference: null },
      { returnUrl: 'https://r.example.com/ret?order=1&a=2', cancelUrl: '', webhookUrl: '' },
    );
    expect(html).toContain('Lifetime &#60;b&#62;');
    expect(html).toContain('&#34;x&#34;@y.z');
    expect(html).toContain('action="https://r.example.com/ret?order=1&#38;a=2"');
  });
});

describe('createGateway', () => {
  it('is off unless PAYMENT_GATEWAY names a known adapter', () => {
    expect(createGateway(configOf({}), quiet)).toBeNull();
    expect(createGateway(configOf({ PAYMENT_GATEWAY: 'off' }), quiet)).toBeNull();
    expect(createGateway(configOf({ PAYMENT_GATEWAY: 'stripe' }), quiet)).toBeNull();
    expect(createGateway(configOf({ PAYMENT_GATEWAY: 'Mock' }), quiet)).toBeInstanceOf(MockGateway);
  });

  it('never runs the test gateway in production', () => {
    expect(createGateway(configOf({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'production' }), quiet)).toBeNull();
  });
});

describe('CheckoutService', () => {
  it('describes the gateway for the checkout page', () => {
    expect(setup().service.publicConfig()).toEqual({
      price: 99,
      currency: 'PKR',
      gateway: { key: 'mock', name: 'Test gateway', brands: ['Test card', 'Test wallet'], testMode: true },
      orderMinutes: 30,
    });
    expect(setup({ gateway: false }).service.publicConfig().gateway).toBeNull();
  });

  it('creates an order with a gateway session and a pay link', async () => {
    const ctx = setup();
    const { order, payUrl } = await startOrder(ctx);
    expect(order).toMatchObject({ status: 'created', amount: 99, currency: 'PKR', provider: 'mock', providerName: 'Test gateway' });
    expect(payUrl).toBe(`https://resume.example.com/api/checkout/orders/${order.id}/pay`);
    expect(ctx.orders[0]).toMatchObject({
      action: { kind: 'redirect', url: `https://resume.example.com/api/checkout/mock/${order.id}` },
      providerRef: `MOCK-${order.id.slice(0, 8).toUpperCase()}`,
    });
  });

  it('refuses when online payment is off or the user already has lifetime access', async () => {
    await expect(setup({ gateway: false }).service.create('u1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(setup({ plan: 'lifetime' }).service.create('u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activates lifetime access once for a verified payment, however often it is reported', async () => {
    const ctx = setup();
    const { order, signed } = await startOrder(ctx);
    const fields = signed('paid');

    const next = await ctx.service.handleReturn('mock', post(fields, { order: order.id }));
    expect(next).toBe(`https://resume.example.com/checkout/result?order=${order.id}`);
    // The same payment again through the webhook changes nothing.
    await ctx.service.handleWebhook('mock', post(fields));

    expect(ctx.payments).toHaveLength(1);
    expect(ctx.payments[0]).toMatchObject({
      userId: 'u1',
      method: 'gateway',
      provider: 'mock',
      transactionId: fields.transaction_id,
      amount: 99,
      status: 'approved',
      reviewedBy: 'Test gateway (automatic)',
    });
    expect(ctx.users[0]).toMatchObject({ plan: 'lifetime' });
    expect(ctx.users[0].planActivatedAt).toBeInstanceOf(Date);
    await expect(ctx.service.status(order.id)).resolves.toMatchObject({ status: 'paid', transactionId: fields.transaction_id });

    // A late "failed" report never undoes a payment.
    await ctx.service.handleWebhook('mock', post(signed('failed')));
    await expect(ctx.service.status(order.id)).resolves.toMatchObject({ status: 'paid' });
  });

  it('does not grant access when the paid amount differs from the order', async () => {
    const ctx = setup();
    const { order, signed } = await startOrder(ctx);
    await ctx.service.handleWebhook('mock', post(signed('paid', 1)));
    expect(ctx.payments).toHaveLength(0);
    expect(ctx.users[0]).toMatchObject({ plan: 'free' });
    await expect(ctx.service.status(order.id)).resolves.toMatchObject({ status: 'failed' });
  });

  it('records declined and cancelled payments, and a later confirmed payment still counts', async () => {
    const ctx = setup();
    const first = await startOrder(ctx);
    await ctx.service.handleReturn('mock', post(first.signed('failed'), { order: first.order.id }));
    await expect(ctx.service.status(first.order.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'The test card was declined.',
    });

    // Back from the gateway's cancel link, without signed data.
    const second = await startOrder(ctx);
    await ctx.service.handleReturn('mock', { query: { order: second.order.id, cancelled: '1' }, body: {}, headers: {} });
    await expect(ctx.service.status(second.order.id)).resolves.toMatchObject({ status: 'cancelled' });

    await ctx.service.handleWebhook('mock', post(second.signed('paid')));
    await expect(ctx.service.status(second.order.id)).resolves.toMatchObject({ status: 'paid' });
    expect(ctx.users[0]).toMatchObject({ plan: 'lifetime' });
  });

  it('ignores unsigned or foreign callbacks', async () => {
    const ctx = setup();
    const { order, signed } = await startOrder(ctx);
    await expect(ctx.service.handleWebhook('mock', post({ ...signed('paid'), amount: '99', signature: '00' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // A return for another gateway only opens the result page.
    await expect(ctx.service.handleReturn('safepay', post(signed('paid'), { order: order.id }))).resolves.toBe(
      `https://resume.example.com/checkout/result?order=${order.id}`,
    );
    expect(ctx.payments).toHaveLength(0);
    await expect(ctx.service.status(order.id)).resolves.toMatchObject({ status: 'created' });
  });

  it('reports an unfinished order as expired after its time is up', async () => {
    const ctx = setup();
    const { order } = await startOrder(ctx);
    ctx.orders[0].expiresAt = new Date(Date.now() - 1000);
    await expect(ctx.service.status(order.id)).resolves.toMatchObject({ status: 'expired' });
  });
});
