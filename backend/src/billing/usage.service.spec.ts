import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { User } from '../users/user.entity.js';
import { BillingConfigService } from './billing-config.service.js';
import type { UsageEvent } from './usage-event.entity.js';
import { AiLimitReachedException, LimitReachedException, UsageService } from './usage.service.js';

type Row = { userId: string; kind: string; day: string; resourceId: string | null };

function matches(row: Row, where: Partial<Row>): boolean {
  return Object.entries(where).every(([key, value]) => row[key as keyof Row] === value);
}

function setup(env: Record<string, string> = {}, plan: 'free' | 'lifetime' = 'free') {
  const config = new BillingConfigService({ get: (key: string) => env[key] } as unknown as ConfigService);
  const rows: Row[] = [];
  const events = {
    find: ({ where }: { where: Partial<Row> }) => Promise.resolve(rows.filter((r) => matches(r, where))),
    countBy: (where: Partial<Row>) => Promise.resolve(rows.filter((r) => matches(r, where)).length),
    insert: (row: Row) => {
      rows.push(row);
      return Promise.resolve();
    },
  } as unknown as Repository<UsageEvent>;
  const users = { findOne: () => Promise.resolve({ id: 'u1', plan }) } as unknown as Repository<User>;
  return { service: new UsageService(events, users, config), rows, config };
}

describe('BillingConfigService', () => {
  it('uses Pakistan time for the daily reset', () => {
    const { config } = setup();
    // 20:30 UTC on Sep 25 is already Sep 26 in Pakistan (UTC+5).
    expect(config.today(new Date('2026-09-25T20:30:00Z'))).toBe('2026-09-26');
    expect(config.resetsAt(new Date('2026-09-25T20:30:00Z')).toISOString()).toBe('2026-09-26T19:00:00.000Z');
  });

  it('reads price, limits and admins from the environment and accepts every payment method', () => {
    const { config } = setup({
      LIFETIME_PRICE_PKR: '149',
      FREE_DAILY_RESUMES: '2',
      ADMIN_EMAILS: 'Admin@Example.com, other@x.com',
    });
    expect(config.price).toBe(149);
    expect(config.limits).toEqual({ resume: 2, cover_letter: 1, document: 1 });
    expect(config.methods.map((m) => m.key)).toEqual(['jazzcash', 'easypaisa', 'bank']);
    expect(config.isAdmin('admin@example.com')).toBe(true);
    expect(config.isAdmin('someone@example.com')).toBe(false);
  });

  it('turns the support WhatsApp number into the international form wa.me needs', () => {
    for (const value of ['03450739458', '+92 345 0739458', '0092-345-0739458', '923450739458']) {
      expect(setup({ SUPPORT_WHATSAPP: value }).config.supportWhatsapp).toBe('923450739458');
    }
    expect(setup({ SUPPORT_WHATSAPP: '' }).config.supportWhatsapp).toBeNull();
  });
});

describe('UsageService', () => {
  it('allows one new resume per day on the free plan', async () => {
    const { service } = setup();
    await expect(service.assertAllowed('u1', 'resume')).resolves.toBeUndefined();
    await service.record('u1', 'resume', 'r1');
    await expect(service.assertAllowed('u1', 'resume')).rejects.toBeInstanceOf(LimitReachedException);
  });

  it('counts documents per distinct file so the same document stays editable', async () => {
    const { service, rows } = setup();
    await service.record('u1', 'document', 'd1');
    await service.record('u1', 'document', 'd1');
    expect(rows).toHaveLength(1);
    await expect(service.assertAllowed('u1', 'document', 'd1')).resolves.toBeUndefined();
    await expect(service.assertAllowed('u1', 'document', 'd2')).rejects.toBeInstanceOf(LimitReachedException);
    await expect(service.assertAllowed('u1', 'document')).rejects.toBeInstanceOf(LimitReachedException);
  });

  it('returns HTTP 402 with the limit details', async () => {
    const { service } = setup();
    await service.record('u1', 'cover_letter');
    try {
      await service.assertAllowed('u1', 'cover_letter');
      throw new Error('expected limit error');
    } catch (error) {
      const exception = error as LimitReachedException;
      expect(exception.getStatus()).toBe(402);
      expect(exception.getResponse()).toMatchObject({ code: 'LIMIT_REACHED', kind: 'cover_letter', limit: 1 });
    }
  });

  it('never limits lifetime members', async () => {
    const { service, rows } = setup({}, 'lifetime');
    await service.record('u1', 'resume', 'r1');
    await service.record('u1', 'resume', 'r2');
    expect(rows).toHaveLength(0);
    await expect(service.assertAllowed('u1', 'resume')).resolves.toBeUndefined();
  });

  it('supports unlimited free usage with a negative limit', async () => {
    const { service } = setup({ FREE_DAILY_RESUMES: '-1' });
    await service.record('u1', 'resume', 'r1');
    await service.record('u1', 'resume', 'r2');
    await expect(service.assertAllowed('u1', 'resume')).resolves.toBeUndefined();
  });

  it('caps AI requests per day for every plan (HTTP 429)', async () => {
    const { service } = setup({ AI_DAILY_LIMIT_FREE: '2' });
    await service.consumeAi('u1');
    await service.consumeAi('u1');
    const error = await service.consumeAi('u1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiLimitReachedException);
    expect((error as AiLimitReachedException).getStatus()).toBe(429);

    const lifetime = setup({ AI_DAILY_LIMIT_LIFETIME: '1' }, 'lifetime').service;
    await lifetime.consumeAi('u1');
    await expect(lifetime.consumeAi('u1')).rejects.toBeInstanceOf(AiLimitReachedException);
  });

  it('does not count AI requests towards the plan limits', async () => {
    const { service } = setup();
    await service.consumeAi('u1');
    const summary = await service.summary('u1');
    expect(summary.used).toEqual({ resume: 0, cover_letter: 0, document: 0 });
  });
});
