import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What the app solves before it may send a sign-in or sign-up (same shape as ALTCHA's challenge). */
export interface PowChallenge {
  algorithm: 'SHA-256';
  /** SHA-256 of salt + a secret number between 0 and maxnumber. */
  challenge: string;
  maxnumber: number;
  /** Random, with the expiry inside ("…?expires=<unix seconds>"), so it is covered by the challenge hash. */
  salt: string;
  /** HMAC of the challenge: proves this server issued it. */
  signature: string;
}

export type PowVerdict = 'ok' | 'missing' | 'invalid';

const TTL_MS = 10 * 60_000;
const DEFAULT_MAX_NUMBER = 50_000;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/**
 * Invisible anti-bot check for the public auth forms (a self-hosted proof of work, no third party).
 * The browser has to find the hidden number — about half a second of hashing on a phone, done in
 * the background while the visitor types — before each sign-in or sign-up. Scripted attacks that
 * do not run the app's code fail outright, and every guess costs real work. Each challenge works
 * once and expires after 10 minutes.
 */
@Injectable()
export class ProofOfWorkService {
  readonly enabled: boolean;
  private readonly maxNumber: number;
  /** Per process: challenges issued before a restart fail once, and the app fetches a new one. */
  private readonly key = randomBytes(32);
  /** Challenges already used, with their expiry, so none can be replayed. */
  private readonly used = new Map<string, number>();
  private lastPrune = 0;
  /** Replaceable clock (tests). */
  now: () => number = () => Date.now();

  constructor(config: ConfigService) {
    this.enabled = !/^(0|false|off|no)$/i.test(config.get<string>('AUTH_PROOF_OF_WORK')?.trim() ?? '');
    const configured = Number(config.get<string>('AUTH_POW_MAX_NUMBER'));
    this.maxNumber = Number.isInteger(configured) && configured >= 1_000 ? Math.min(configured, 10_000_000) : DEFAULT_MAX_NUMBER;
  }

  issue(): PowChallenge {
    const expires = Math.floor((this.now() + TTL_MS) / 1000);
    const salt = `${randomBytes(12).toString('hex')}?expires=${expires}`;
    const challenge = sha256(salt + randomInt(0, this.maxNumber + 1));
    return { algorithm: 'SHA-256', challenge, maxnumber: this.maxNumber, salt, signature: this.sign(challenge) };
  }

  /** Checks the base64 JSON payload the app sends back ({ algorithm, challenge, number, salt, signature }). */
  verify(payload: unknown): PowVerdict {
    if (!this.enabled) return 'ok';
    if (typeof payload !== 'string' || !payload) return 'missing';
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>;
    } catch {
      return 'invalid';
    }
    const { algorithm, challenge, number, salt, signature } = data ?? {};
    if (
      algorithm !== 'SHA-256' ||
      typeof challenge !== 'string' ||
      typeof salt !== 'string' ||
      typeof signature !== 'string' ||
      typeof number !== 'number' ||
      !Number.isSafeInteger(number) ||
      number < 0
    ) {
      return 'invalid';
    }
    const expires = Number(/[?&]expires=(\d+)/.exec(salt)?.[1]);
    if (!expires || expires * 1000 < this.now()) return 'invalid';
    if (!sameHex(signature, this.sign(challenge)) || sha256(salt + number) !== challenge) return 'invalid';

    this.forgetExpired();
    if (this.used.has(challenge)) return 'invalid';
    this.used.set(challenge, expires * 1000);
    return 'ok';
  }

  private sign(challenge: string): string {
    return createHmac('sha256', this.key).update(challenge).digest('hex');
  }

  /** At most once a minute: used challenges only need remembering until they expire anyway. */
  private forgetExpired(): void {
    const now = this.now();
    if (now - this.lastPrune < 60_000) return;
    this.lastPrune = now;
    for (const [challenge, expiresAt] of this.used) if (expiresAt < now) this.used.delete(challenge);
  }
}
