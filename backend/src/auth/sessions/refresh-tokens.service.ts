import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity.js';

/** A refresh token used again within this time (two tabs refreshing at once) is not treated as theft. */
export const REUSE_GRACE_MS = 60_000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** How long a device stays signed in without opening the app (JWT_EXPIRES_IN_DAYS, default 7). */
export function sessionLifetimeMs(config: ConfigService): number {
  const days = Number(config.get<string>('JWT_EXPIRES_IN_DAYS') ?? 7);
  return (Number.isFinite(days) ? Math.max(1, days) : 7) * 24 * 60 * 60_000;
}

/** The app reacts to this code by signing out (the device has to sign in again). */
export function sessionExpired(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    error: 'Unauthorized',
    code: 'SESSION_EXPIRED',
    message: 'Your session has expired, please sign in again',
  });
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Refresh tokens: random, single use, stored only as a hash. A sign-in starts a family; every refresh
 * swaps the token for a new one in that family and extends the session. A token that comes back
 * after it was swapped (outside a short grace period for parallel refreshes) means a copy is
 * being used somewhere else, so the whole family ends and that device signs in again.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger('Auth');
  readonly lifetimeMs: number;
  private lastPrune = 0;

  constructor(
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    config: ConfigService,
  ) {
    this.lifetimeMs = sessionLifetimeMs(config);
  }

  /** A new token: for a new sign-in, or (with familyId) the replacement in a refresh. */
  async issue(userId: string, tokenVersion: number, familyId: string = randomUUID()): Promise<string> {
    this.prune();
    const token = randomBytes(32).toString('base64url');
    await this.tokens.insert({
      userId,
      tokenHash: hash(token),
      familyId,
      tokenVersion,
      expiresAt: new Date(Date.now() + this.lifetimeMs),
      usedAt: null,
    });
    return token;
  }

  /** The stored entry of a token that has not expired; 401 otherwise. */
  async find(token: string | undefined): Promise<RefreshToken> {
    const entry = token && TOKEN.test(token) ? await this.tokens.findOneBy({ tokenHash: hash(token) }) : null;
    if (!entry || entry.expiresAt.getTime() <= Date.now()) throw sessionExpired();
    return entry;
  }

  /**
   * Swaps the token for a new one. Null when it was swapped moments ago (another tab, or a retried
   * request): that caller keeps the token it already received. Reuse after the grace period ends
   * the family.
   */
  async rotate(entry: RefreshToken): Promise<string | null> {
    if (entry.usedAt) return this.reused(entry, entry.usedAt);
    const claimed = await this.tokens.update({ id: entry.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!claimed.affected) {
      const current = await this.tokens.findOneBy({ id: entry.id });
      if (!current?.usedAt) throw sessionExpired();
      return this.reused(entry, current.usedAt);
    }
    return this.issue(entry.userId, entry.tokenVersion, entry.familyId);
  }

  /** Signing out on this device: the token and everything rotated from the same sign-in. */
  async revoke(token: string | undefined): Promise<void> {
    if (!token || !TOKEN.test(token)) return;
    const entry = await this.tokens.findOneBy({ tokenHash: hash(token) });
    if (entry) await this.revokeFamily(entry.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.delete({ familyId });
  }

  /** Every device of the account (password change, "sign out everywhere"). */
  async revokeAll(userId: string): Promise<void> {
    await this.tokens.delete({ userId });
  }

  private async reused(entry: RefreshToken, usedAt: Date): Promise<null> {
    if (Date.now() - usedAt.getTime() <= REUSE_GRACE_MS) return null;
    await this.revokeFamily(entry.familyId);
    this.logger.warn(`A replaced refresh token was used again; that sign-in was ended (user ${entry.userId}).`);
    throw sessionExpired();
  }

  /** Deletes expired tokens, at most once an hour (in the background). */
  private prune(): void {
    const now = Date.now();
    if (now - this.lastPrune < 60 * 60_000) return;
    this.lastPrune = now;
    this.tokens
      .delete({ expiresAt: LessThan(new Date(now)) })
      .catch((error: unknown) => this.logger.warn(`Could not delete expired refresh tokens: ${(error as Error).message}`));
  }
}
