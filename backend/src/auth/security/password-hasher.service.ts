import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import bcrypt from 'bcryptjs';

/** bcrypt work factor for new hashes (about 0.1 s here, 0.25 s on shared hosting); older hashes are upgraded at sign-in. */
export const BCRYPT_COST = 11;
/** bcryptjs runs on the main thread: a few hashes at a time keep every other request responsive. */
const MAX_RUNNING = 2;
const MAX_WAITING = 50;

/**
 * Password hashing with three protections: a hash is always computed (also for unknown emails, so
 * response times do not reveal which accounts exist), hashing is limited to a few at a time with a
 * bounded queue (a flood of sign-ins cannot starve the server), and outdated work factors are
 * reported so sign-in can re-hash them.
 */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  private dummy?: Promise<string>;

  /** Prepared at startup, so the first sign-in with an unknown email is not slower than the rest. */
  onModuleInit(): void {
    void this.dummyHash();
  }

  hash(password: string): Promise<string> {
    return this.limit(() => bcrypt.hash(password, BCRYPT_COST));
  }

  /** True only when there is a stored hash and the password matches it. */
  async verify(password: string, hash: string | null | undefined): Promise<boolean> {
    const target = hash || (await this.dummyHash());
    const matches = await this.limit(() => bcrypt.compare(password, target));
    return !!hash && matches;
  }

  needsRehash(hash: string): boolean {
    try {
      return bcrypt.getRounds(hash) < BCRYPT_COST;
    } catch {
      return false;
    }
  }

  private dummyHash(): Promise<string> {
    return (this.dummy ??= bcrypt.hash(randomBytes(18).toString('base64'), BCRYPT_COST));
  }

  private async limit<T>(work: () => Promise<T>): Promise<T> {
    if (this.running < MAX_RUNNING) {
      this.running++;
    } else {
      if (this.waiting.length >= MAX_WAITING) {
        throw new ServiceUnavailableException('The server is busy right now. Please try again in a moment.');
      }
      // The finishing task hands its slot straight to us, so "running" stays exact.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}
