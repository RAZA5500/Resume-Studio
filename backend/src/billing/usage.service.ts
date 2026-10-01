import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { BillingConfigService, type UsageKind } from './billing-config.service.js';
import { UsageEvent } from './usage-event.entity.js';

const LIMIT_MESSAGES: Record<UsageKind, (limit: number) => string> = {
  resume: (n) => `Free plan allows ${n} new resume${n === 1 ? '' : 's'} per day.`,
  cover_letter: (n) => `Free plan allows ${n} cover letter${n === 1 ? '' : 's'} per day.`,
  document: (n) => `Free plan allows editing ${n} document${n === 1 ? '' : 's'} per day.`,
};

/** HTTP 402 — the frontend shows the upgrade dialog when it receives this. */
export class LimitReachedException extends HttpException {
  constructor(kind: UsageKind, limit: number, resetsAt: Date, price: number) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        code: 'LIMIT_REACHED',
        kind,
        limit,
        resetsAt: resetsAt.toISOString(),
        message: `${LIMIT_MESSAGES[kind](limit)} Upgrade to Lifetime (PKR ${price}, one-time) for unlimited access.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** HTTP 429 — the daily fair-use cap on AI requests is used up. */
export class AiLimitReachedException extends HttpException {
  constructor(limit: number, lifetime: boolean, resetsAt: Date) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: 'AI_LIMIT_REACHED',
        limit,
        resetsAt: resetsAt.toISOString(),
        message:
          `You have used today's ${limit} AI requests. The limit resets at midnight` +
          (lifetime ? '.' : ' — lifetime members get more.'),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface UsageSummary {
  plan: 'free' | 'lifetime';
  day: string;
  resetsAt: string;
  limits: Record<UsageKind, number>;
  used: Record<UsageKind, number>;
}

/**
 * Daily limits for free users. Documents are counted per distinct file, so a
 * free user can keep editing the same document all day.
 */
@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(UsageEvent) private readonly events: Repository<UsageEvent>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: BillingConfigService,
  ) {}

  async isLifetime(userId: string): Promise<boolean> {
    const user = await this.users.findOne({ where: { id: userId }, select: { id: true, plan: true } });
    return user?.plan === 'lifetime';
  }

  /** Throws LimitReachedException when a free user has used today's allowance. */
  async assertAllowed(userId: string, kind: UsageKind, resourceId?: string): Promise<void> {
    if (await this.isLifetime(userId)) return;
    const limit = this.config.limits[kind];
    if (limit < 0) return;
    const rows = await this.events.find({
      where: { userId, kind, day: this.config.today() },
      select: { id: true, resourceId: true },
    });
    if (kind === 'document' && resourceId && rows.some((r) => r.resourceId === resourceId)) return;
    const used = kind === 'document' ? new Set(rows.map((r) => r.resourceId)).size : rows.length;
    if (used >= limit) {
      throw new LimitReachedException(kind, limit, this.config.resetsAt(), this.config.price);
    }
  }

  /** Records a counted action (no-op for lifetime members and repeated document edits). */
  async record(userId: string, kind: UsageKind, resourceId?: string | null): Promise<void> {
    if (await this.isLifetime(userId)) return;
    const day = this.config.today();
    if (kind === 'document' && resourceId) {
      const already = await this.events.countBy({ userId, kind, day, resourceId });
      if (already) return;
    }
    await this.events.insert({ userId, kind, day, resourceId: resourceId ?? null });
  }

  /** Counts one AI model call against the user's daily fair-use cap; throws when it is used up. */
  async consumeAi(userId: string): Promise<void> {
    const lifetime = await this.isLifetime(userId);
    const limit = lifetime ? this.config.aiLimits.lifetime : this.config.aiLimits.free;
    if (limit < 0) return;
    const day = this.config.today();
    const used = await this.events.countBy({ userId, kind: 'ai', day });
    if (used >= limit) throw new AiLimitReachedException(limit, lifetime, this.config.resetsAt());
    await this.events.insert({ userId, kind: 'ai', day, resourceId: null });
  }

  async summary(userId: string): Promise<UsageSummary> {
    const day = this.config.today();
    const rows = await this.events.find({ where: { userId, day }, select: { id: true, kind: true, resourceId: true } });
    const count = (kind: UsageKind) => {
      const list = rows.filter((r) => r.kind === kind);
      return kind === 'document' ? new Set(list.map((r) => r.resourceId)).size : list.length;
    };
    return {
      plan: (await this.isLifetime(userId)) ? 'lifetime' : 'free',
      day,
      resetsAt: this.config.resetsAt().toISOString(),
      limits: this.config.limits,
      used: { resume: count('resume'), cover_letter: count('cover_letter'), document: count('document') },
    };
  }
}
