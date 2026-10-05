import { createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderSVG } from 'uqr';
import type { User } from '../../users/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import { AuthAttemptsService } from '../security/auth-attempts.service.js';
import { SecretBox } from './secret-box.js';
import { base32Decode, base32Encode, otpauthUri, verifyTotp } from './totp.js';

const ISSUER = 'ResumeStudio';
/** Time to type the code after the password was accepted. */
const CHALLENGE_MS = 5 * 60_000;
const CHALLENGE_TRIES = 5;
const DEVICE_DAYS = 30;
const BACKUP_CODE_COUNT = 10;
/** No 0/1/l/o, so codes can be read back from paper. */
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  /** Single-use id for POST auth/2fa/verify. */
  challenge: string;
  methods: ('app' | 'backup')[];
}

function rejected(code: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message });
}

const hashBackupCode = (code: string) => createHash('sha256').update(code).digest('hex');
/** "ABCD-EFGH ", "abcd efgh" and "abcdefgh" are the same backup code. */
const normalizeBackupCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Two-factor sign-in with an authenticator app (TOTP) plus one-time backup codes.
 *
 * - Secrets are stored encrypted (SecretBox, key from TWO_FACTOR_KEY or JWT_SECRET); backup codes
 *   only as SHA-256 hashes. Every app code and backup code works once.
 * - Sign-in with 2FA on: after the password (or Google / Apple) the API answers with a challenge
 *   instead of a session; POST auth/2fa/verify finishes it. Five wrong codes end the challenge,
 *   and repeated failures lock two-factor attempts for the account (AuthAttemptsService).
 * - "Remember this device": a signed 30-day token that skips the code on that device. It stops
 *   working when the password changes, the user signs out everywhere, or 2FA is turned off or on.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger('Auth');
  private readonly box: SecretBox | null;
  private readonly deviceKey: Buffer | null;
  private readonly challenges = new Map<string, { userId: string; tries: number; expires: number }>();
  private lastPrune = 0;

  constructor(
    private readonly users: UsersService,
    private readonly attempts: AuthAttemptsService,
    config: ConfigService,
  ) {
    const secrets = [config.get<string>('TWO_FACTOR_KEY'), config.get<string>('JWT_SECRET')]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);
    // Without a configured secret the keys would change at every restart and lock everyone out.
    this.box = secrets.length ? new SecretBox(secrets, 'two-factor-secret') : null;
    this.deviceKey = secrets.length ? Buffer.from(hkdfSync('sha256', secrets[0], 'resumestudio', 'trusted-device', 32)) : null;
    if (!this.box) this.logger.warn('Two-factor sign-in is unavailable: set JWT_SECRET (or TWO_FACTOR_KEY).');
  }

  get available(): boolean {
    return !!this.box;
  }

  // ------------------------------------------------------------------ setup (signed in)

  /** Starts setup: a new secret, as text and as a QR code for the authenticator app. */
  async setup(userId: string): Promise<{ secret: string; uri: string; qrSvg: string }> {
    const box = this.requireBox();
    const user = await this.users.findById(userId);
    if (user.twoFactorEnabledAt) throw rejected('TWO_FACTOR_ON', 'Two-factor sign-in is already on.');
    const secret = base32Encode(randomBytes(20));
    await this.users.update(userId, { twoFactorSecret: box.seal(secret), twoFactorLastStep: null });
    const uri = otpauthUri(ISSUER, user.email, secret);
    return { secret, uri, qrSvg: renderSVG(uri, { border: 2 }) };
  }

  /** Confirms setup with a code from the app; returns the backup codes (shown once). */
  async enable(userId: string, code: string, ip: string): Promise<{ backupCodes: string[] }> {
    const key = `2fa:${userId}`;
    this.attempts.assertLoginAllowed(key, ip);
    const state = await this.users.twoFactorState(userId);
    if (state.enabledAt) throw rejected('TWO_FACTOR_ON', 'Two-factor sign-in is already on.');
    const secret = state.secret ? this.openSecret(userId, state.secret) : null;
    if (!secret) throw rejected('TWO_FACTOR_SETUP', 'Please start the setup again.');
    const step = verifyTotp(secret, code.replace(/\s/g, ''), null);
    if (step === null) {
      this.attempts.loginFailed(key, ip);
      throw rejected('INVALID_2FA_CODE', 'That code did not match. Check the time on your phone and enter the newest code.');
    }
    this.attempts.loginSucceeded(key, ip);
    const backupCodes = this.newBackupCodes();
    await this.users.update(userId, {
      twoFactorEnabledAt: new Date(),
      twoFactorLastStep: step,
      twoFactorBackupCodes: backupCodes.map((c) => hashBackupCode(normalizeBackupCode(c))),
    });
    this.logger.log(`Two-factor sign-in turned on for user ${userId}.`);
    return { backupCodes };
  }

  /** Turns 2FA off (needs a current app code or a backup code). Trusted devices stop working. */
  async disable(userId: string, code: string, ip: string): Promise<{ success: true }> {
    await this.checkCode(userId, code, ip);
    await this.users.update(userId, { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null, twoFactorBackupCodes: null });
    this.logger.log(`Two-factor sign-in turned off for user ${userId}.`);
    return { success: true };
  }

  /** A fresh set of backup codes; the old ones stop working. */
  async regenerateBackupCodes(userId: string, code: string, ip: string): Promise<{ backupCodes: string[] }> {
    await this.checkCode(userId, code, ip);
    const backupCodes = this.newBackupCodes();
    await this.users.update(userId, { twoFactorBackupCodes: backupCodes.map((c) => hashBackupCode(normalizeBackupCode(c))) });
    return { backupCodes };
  }

  // ------------------------------------------------------------------ sign-in

  /** True when this sign-in still needs the second step (2FA on, and no valid trusted-device token). */
  needsSecondStep(user: Pick<User, 'id' | 'twoFactorEnabledAt' | 'tokenVersion'>, deviceTokens: readonly string[] = []): boolean {
    if (!user.twoFactorEnabledAt) return false;
    return !deviceTokens.some((token) => this.deviceTrusted(token, user));
  }

  createChallenge(userId: string): TwoFactorChallenge {
    this.prune();
    const challenge = randomBytes(24).toString('base64url');
    this.challenges.set(challenge, { userId, tries: 0, expires: Date.now() + CHALLENGE_MS });
    return { twoFactorRequired: true, challenge, methods: ['app', 'backup'] };
  }

  /** Finishes a challenge with an app code or a backup code; returns the user id. */
  async completeChallenge(challenge: string, code: string, ip: string): Promise<{ userId: string; usedBackupCode: boolean }> {
    const entry = this.challenges.get(challenge);
    if (!entry || entry.expires < Date.now()) {
      this.challenges.delete(challenge);
      throw rejected('TWO_FACTOR_EXPIRED', 'This sign-in expired. Please sign in again.');
    }
    entry.tries++;
    try {
      const method = await this.checkCode(entry.userId, code, ip);
      this.challenges.delete(challenge);
      return { userId: entry.userId, usedBackupCode: method === 'backup' };
    } catch (error) {
      if (entry.tries >= CHALLENGE_TRIES) this.challenges.delete(challenge);
      throw error;
    }
  }

  /** "Remember this device": a 30-day token bound to the account's current session and 2FA setup. */
  deviceToken(user: Pick<User, 'id' | 'tokenVersion' | 'twoFactorEnabledAt'>): string | null {
    if (!this.deviceKey || !user.twoFactorEnabledAt) return null;
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        tv: user.tokenVersion ?? 0,
        fv: user.twoFactorEnabledAt.getTime(),
        exp: Date.now() + DEVICE_DAYS * 24 * 3600_000,
      }),
    ).toString('base64url');
    return `${payload}.${createHmac('sha256', this.deviceKey).update(payload).digest('base64url')}`;
  }

  private deviceTrusted(token: string, user: Pick<User, 'id' | 'tokenVersion' | 'twoFactorEnabledAt'>): boolean {
    if (!this.deviceKey || typeof token !== 'string') return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expected = createHmac('sha256', this.deviceKey).update(payload).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown; tv?: unknown; fv?: unknown; exp?: unknown };
      return (
        claims.sub === user.id &&
        claims.tv === (user.tokenVersion ?? 0) &&
        claims.fv === user.twoFactorEnabledAt?.getTime() &&
        typeof claims.exp === 'number' &&
        claims.exp > Date.now()
      );
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ helpers

  /** Accepts a current app code (6 digits) or an unused backup code; counts failures against the account. */
  private async checkCode(userId: string, input: string, ip: string): Promise<'app' | 'backup'> {
    const key = `2fa:${userId}`;
    this.attempts.assertLoginAllowed(key, ip);
    const state = await this.users.twoFactorState(userId);
    if (!state.enabledAt) throw rejected('TWO_FACTOR_OFF', 'Two-factor sign-in is not turned on.');

    const code = input.replace(/\s/g, '');
    let method: 'app' | 'backup' | null = null;
    if (/^\d{6}$/.test(code)) {
      const secret = state.secret ? this.openSecret(userId, state.secret) : null;
      const step = secret ? verifyTotp(secret, code, state.lastStep) : null;
      if (step !== null && (await this.users.useTotpStep(userId, step))) method = 'app';
    } else {
      const normalized = normalizeBackupCode(code);
      if (normalized.length === 8 && (await this.users.useBackupCode(userId, hashBackupCode(normalized)))) method = 'backup';
    }
    if (!method) {
      this.attempts.loginFailed(key, ip);
      throw rejected('INVALID_2FA_CODE', 'That code did not work. Enter the newest 6-digit code from your app, or a backup code.');
    }
    this.attempts.loginSucceeded(key, ip);
    if (method === 'backup') {
      const left = (await this.users.twoFactorState(userId)).backupCodes.length;
      this.logger.log(`Backup code used for user ${userId} (${left} left).`);
    }
    return method;
  }

  /** Decrypts a stored secret, re-encrypting it if it was sealed with an older key. */
  private openSecret(userId: string, sealed: string): Buffer | null {
    const opened = this.box?.open(sealed);
    if (!opened) {
      this.logger.error(`Could not decrypt the two-factor secret of user ${userId} (was TWO_FACTOR_KEY / JWT_SECRET changed?).`);
      return null;
    }
    if (opened.stale && this.box) {
      void this.users.update(userId, { twoFactorSecret: this.box.seal(opened.value) }).catch(() => undefined);
    }
    return base32Decode(opened.value);
  }

  private newBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const chars = Array.from({ length: 8 }, () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]).join('');
      return `${chars.slice(0, 4)}-${chars.slice(4)}`;
    });
  }

  private requireBox(): SecretBox {
    if (!this.box) throw rejected('TWO_FACTOR_UNAVAILABLE', 'Two-factor sign-in is not available on this server.');
    return this.box;
  }

  private prune(): void {
    const now = Date.now();
    if (now - this.lastPrune < 60_000 && this.challenges.size < 10_000) return;
    this.lastPrune = now;
    for (const [id, entry] of this.challenges) if (entry.expires < now) this.challenges.delete(id);
    for (const id of this.challenges.keys()) {
      if (this.challenges.size < 10_000) break;
      this.challenges.delete(id);
    }
  }
}

