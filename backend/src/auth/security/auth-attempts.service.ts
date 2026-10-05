import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

interface Rule {
  /** Failures (or sign-ups) allowed inside the window. */
  max: number;
  windowMs: number;
  /** First lock; every further lock within a day doubles, up to maxLockMs. */
  lockMs: number;
  maxLockMs: number;
}

/**
 * Sign-in: one address from one network gets 5 tries per 15 minutes; one address from anywhere 20
 * per hour (credential stuffing spread over many IPs); one network 50 per 15 minutes across all
 * addresses. Unknown addresses are counted exactly like real ones, so a lock never tells an
 * attacker whether an account exists.
 */
const RULES = {
  pair: { max: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE, maxLockMs: 12 * 60 * MINUTE },
  account: { max: 20, windowMs: 60 * MINUTE, lockMs: 30 * MINUTE, maxLockMs: 12 * 60 * MINUTE },
  ip: { max: 50, windowMs: 15 * MINUTE, lockMs: 30 * MINUTE, maxLockMs: 12 * 60 * MINUTE },
  /** New accounts per network per hour. */
  signups: { max: 20, windowMs: 60 * MINUTE, lockMs: 60 * MINUTE, maxLockMs: 24 * 60 * MINUTE },
  /** "Email already registered" answers per network per hour (stops probing which emails exist). */
  taken: { max: 10, windowMs: 60 * MINUTE, lockMs: 60 * MINUTE, maxLockMs: 24 * 60 * MINUTE },
} satisfies Record<string, Rule>;

interface Entry {
  hits: number[];
  lockedUntil: number;
  /** Locks so far (doubles the next one); forgotten a day after the last lock ends. */
  strikes: number;
  touched: number;
}

/** HTTP 429 with the seconds to wait, which the app turns into a countdown. */
export class TooManyAttemptsException extends HttpException {
  constructor(
    readonly retryAfter: number,
    message: string,
  ) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, error: 'Too Many Requests', code: 'TOO_MANY_ATTEMPTS', message, retryAfter },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** "4 minutes", "1 hour"… for lock messages. */
function waitText(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** s***@gmail.com — enough to follow an incident in the logs without storing addresses. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

/**
 * Brute-force protection for sign-in, password changes and sign-up: sliding-window counters with
 * escalating locks. Kept in memory (the app runs as one process); a restart forgets the counters,
 * which only gives an attacker a few more tries.
 */
@Injectable()
export class AuthAttemptsService {
  private readonly logger = new Logger('Auth');
  private readonly entries = new Map<string, Entry>();
  private lastSweep = 0;
  /** Replaceable clock (tests). */
  now: () => number = () => Date.now();

  /** Throws while this account, this network, or the two together are locked. */
  assertLoginAllowed(account: string, ip: string): void {
    this.assertOpen(
      [`pair:${account}|${ip}`, `account:${account}`, `ip:${ip}`],
      (wait) => `Too many failed sign-in attempts. Please wait ${wait} and try again.`,
    );
  }

  loginFailed(account: string, ip: string): void {
    const pair = this.hit(`pair:${account}|${ip}`, RULES.pair);
    const anywhere = this.hit(`account:${account}`, RULES.account);
    const network = this.hit(`ip:${ip}`, RULES.ip);
    if (pair) this.logger.warn(`Sign-in locked for ${this.describe(account)} from ${ip} for ${waitText(pair / 1000)}.`);
    if (anywhere) this.logger.warn(`Sign-in locked for ${this.describe(account)} from every network for ${waitText(anywhere / 1000)}.`);
    if (network) this.logger.warn(`Sign-in locked for network ${ip} for ${waitText(network / 1000)} (failures across many accounts).`);
  }

  /** A correct password clears that account's counters (not the network's). */
  loginSucceeded(account: string, ip: string): void {
    this.entries.delete(`pair:${account}|${ip}`);
    this.entries.delete(`account:${account}`);
  }

  assertSignupAllowed(ip: string): void {
    this.assertOpen(
      [`signups:${ip}`, `taken:${ip}`],
      (wait) => `Too many sign-up attempts from your network. Please try again in ${wait}.`,
    );
  }

  signupCreated(ip: string): void {
    if (this.hit(`signups:${ip}`, RULES.signups)) this.logger.warn(`Sign-ups paused for network ${ip} (too many new accounts).`);
  }

  signupTaken(ip: string): void {
    if (this.hit(`taken:${ip}`, RULES.taken)) this.logger.warn(`Sign-ups paused for network ${ip} (probing registered emails).`);
  }

  private assertOpen(keys: string[], message: (wait: string) => string): void {
    const now = this.now();
    let until = 0;
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (entry && entry.lockedUntil > now) until = Math.max(until, entry.lockedUntil);
    }
    if (!until) return;
    const seconds = Math.max(1, Math.ceil((until - now) / 1000));
    throw new TooManyAttemptsException(seconds, message(waitText(seconds)));
  }

  /** Records one event; returns the lock length when this event starts a lock, else 0. */
  private hit(key: string, rule: Rule): number {
    const now = this.now();
    this.sweep(now);
    const entry = this.entries.get(key) ?? { hits: [], lockedUntil: 0, strikes: 0, touched: now };
    if (entry.strikes && entry.lockedUntil + DAY < now) entry.strikes = 0;
    entry.hits = entry.hits.filter((at) => now - at < rule.windowMs);
    entry.hits.push(now);
    entry.touched = now;
    let lockMs = 0;
    if (entry.hits.length >= rule.max) {
      lockMs = Math.min(rule.lockMs * 2 ** entry.strikes, rule.maxLockMs);
      entry.lockedUntil = now + lockMs;
      entry.strikes++;
      entry.hits = [];
    }
    this.entries.set(key, entry);
    return lockMs;
  }

  /** Drops counters nobody touched for a day (once a minute at most), and caps the map's size. */
  private sweep(now: number): void {
    if (now - this.lastSweep < MINUTE && this.entries.size < 100_000) return;
    this.lastSweep = now;
    for (const [key, entry] of this.entries) {
      if (now - entry.touched > DAY && entry.lockedUntil < now) this.entries.delete(key);
    }
    // Under a flood of distinct keys, forget the oldest rather than run out of memory.
    for (const key of this.entries.keys()) {
      if (this.entries.size <= 100_000) break;
      this.entries.delete(key);
    }
  }

  private describe(account: string): string {
    return account.startsWith('user:') ? `account ${account.slice(5)}` : maskEmail(account);
  }
}
