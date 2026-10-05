import { createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { siteUrlFrom } from '../../common/site-url.js';
import { MailService } from '../../mail/mail.service.js';
import { verificationEmail } from '../../mail/templates.js';
import type { User } from '../../users/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import { maskEmail, TooManyAttemptsException } from '../security/auth-attempts.service.js';
import { EmailVerification } from './email-verification.entity.js';

/** How long a code and its link work. */
export const VERIFICATION_MINUTES = 30;
const RESEND_SECONDS = 60;
const SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
/** Opening the verification page again keeps an emailed code that still works at least this long. */
const REUSE_MINUTES = 5;

type Recipient = Pick<User, 'id' | 'email' | 'fullName' | 'emailVerifiedAt'>;

export interface SendResult {
  /** False when the code emailed earlier still works, so nothing new was sent. */
  sent: boolean;
  /** Seconds until another email can be asked for. */
  retryAfter: number;
}

export type LinkResult = { verified: true; email: string } | { verified: false; needsConfirmation: true; email: string };

function rejected(code: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message });
}

/**
 * Confirms that an account owns its email address: a 6-digit code (typed into the app) and a link
 * (one click), sent together from the site's own mailbox (MailService). Codes and links are stored
 * only as keyed hashes, work for 30 minutes, allow five wrong tries, and emails are spaced at least
 * a minute apart with at most five per hour. Off — nobody is asked — while email is not configured.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger('Auth');
  private readonly key: Buffer;
  private readonly siteUrl: string;

  constructor(
    @InjectRepository(EmailVerification) private readonly verifications: Repository<EmailVerification>,
    private readonly users: UsersService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('TWO_FACTOR_KEY')?.trim() || config.get<string>('JWT_SECRET')?.trim() || randomBytes(32).toString('hex');
    this.key = Buffer.from(hkdfSync('sha256', secret, 'resumestudio', 'email-verification', 32));
    this.siteUrl = siteUrlFrom(config);
  }

  /** Verification is asked for only when the site can send email. */
  get required(): boolean {
    return this.mail.enabled;
  }

  needsVerification(user: Pick<User, 'emailVerifiedAt'>): boolean {
    return this.required && !user.emailVerifiedAt;
  }

  /**
   * For the verification page: emails a code and link, unless the email sent earlier still works —
   * opening the page again (or on a second device) must not break the code already in the inbox.
   */
  async send(user: Recipient): Promise<SendResult> {
    this.assertNeeded(user);
    const now = Date.now();
    const open = await this.verifications.findOneBy({ userId: user.id });
    if (open && open.attempts < MAX_ATTEMPTS && open.expiresAt.getTime() - now > REUSE_MINUTES * 60_000) {
      return { sent: false, retryAfter: this.resendWait(open, now) };
    }
    return this.deliver(user, open, now);
  }

  /** "Send a new code": replaces the open code, so the earlier email stops working. */
  async resend(user: Recipient): Promise<SendResult> {
    this.assertNeeded(user);
    return this.deliver(user, await this.verifications.findOneBy({ userId: user.id }), Date.now());
  }

  /** Checks a typed code; marks the email verified when it matches (and is a no-op once it is). */
  async verifyCode(user: Pick<User, 'id' | 'emailVerifiedAt'>, code: string): Promise<void> {
    if (user.emailVerifiedAt) return;
    const entry = await this.verifications.findOneBy({ userId: user.id });
    if (!entry || entry.expiresAt.getTime() < Date.now() || entry.attempts >= MAX_ATTEMPTS) {
      throw rejected('VERIFICATION_EXPIRED', 'This code has expired. Ask for a new email.');
    }
    if (!/^\d{6}$/.test(code) || !this.same(this.hash(code), entry.codeHash)) {
      await this.verifications.increment({ userId: user.id }, 'attempts', 1);
      const left = MAX_ATTEMPTS - entry.attempts - 1;
      throw rejected(
        left > 0 ? 'INVALID_VERIFICATION_CODE' : 'VERIFICATION_EXPIRED',
        left > 0 ? 'That code is not right. Use the code from the newest email.' : 'Too many wrong tries. Ask for a new email.',
      );
    }
    await this.markVerified(user.id);
  }

  /**
   * The link from the email. Opened where its own account is signed in, it verifies at once;
   * anywhere else only after the person confirms (signedInAs ≠ owner and confirm false) — mail
   * scanners that open links must not verify an address on their own.
   */
  async verifyLink(token: string, signedInAs: string | undefined, confirm: boolean): Promise<LinkResult> {
    const entry = await this.verifications.findOneBy({ linkHash: this.hash(token) });
    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      throw rejected('VERIFICATION_EXPIRED', 'This link has expired or was already used.');
    }
    const owner = await this.users.findById(entry.userId);
    const email = maskEmail(owner.email);
    if (!confirm && signedInAs !== entry.userId) return { verified: false, needsConfirmation: true, email };
    await this.markVerified(entry.userId);
    return { verified: true, email };
  }

  /** The address changed: the code and link sent to the old one stop working (the hourly count stays). */
  async expireCode(userId: string): Promise<void> {
    await this.verifications.update({ userId }, { expiresAt: new Date(0), sentAt: new Date(0) });
  }

  private assertNeeded(user: Recipient): void {
    if (!this.required) throw rejected('VERIFICATION_OFF', 'Email verification is not needed right now.');
    if (user.emailVerifiedAt) throw rejected('ALREADY_VERIFIED', 'Your email address is already verified.');
  }

  private async deliver(user: Recipient, previous: EmailVerification | null, now: number): Promise<SendResult> {
    if (previous) {
      const wait = this.resendWait(previous, now);
      if (wait > 0) throw new TooManyAttemptsException(wait, `Please wait ${wait} seconds before asking for another email.`);
      const windowAge = now - previous.windowStart.getTime();
      if (windowAge < 3600_000 && previous.sendCount >= SENDS_PER_HOUR) {
        const hourWait = Math.ceil((3600_000 - windowAge) / 1000);
        throw new TooManyAttemptsException(hourWait, `Too many emails were sent. Please try again in ${Math.ceil(hourWait / 60)} minutes.`);
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const token = randomBytes(32).toString('base64url');
    // The hourly count continues within the hour and starts over after it.
    const window = previous && now - previous.windowStart.getTime() < 3600_000 ? previous : null;
    // Saved before sending, so the code works the moment the email arrives.
    await this.verifications.upsert(
      {
        userId: user.id,
        codeHash: this.hash(code),
        linkHash: this.hash(token),
        expiresAt: new Date(now + VERIFICATION_MINUTES * 60_000),
        attempts: 0,
        sentAt: new Date(now),
        sendCount: window ? window.sendCount + 1 : 1,
        windowStart: window ? window.windowStart : new Date(now),
      },
      ['userId'],
    );
    try {
      await this.mail.send(
        verificationEmail({
          to: user.email,
          name: user.fullName,
          code,
          link: `${this.siteUrl}/verify-email?token=${token}`,
          minutes: VERIFICATION_MINUTES,
        }),
      );
    } catch (error) {
      this.logger.error(`Could not send the verification email to user ${user.id}: ${(error as Error).message}`);
      await this.restore(user.id, previous);
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'EMAIL_NOT_SENT',
        message: 'We could not send the email just now. Please try again in a few minutes.',
      });
    }
    this.logger.log(`Verification email sent to ${maskEmail(user.email)}.`);
    return { sent: true, retryAfter: RESEND_SECONDS };
  }

  /** After a failed send: the earlier code stays the one that works, and asking again is allowed at once. */
  private async restore(userId: string, previous: EmailVerification | null): Promise<void> {
    try {
      if (!previous) {
        await this.verifications.delete({ userId });
        return;
      }
      const { codeHash, linkHash, expiresAt, attempts, sentAt, sendCount, windowStart } = previous;
      await this.verifications.update({ userId }, { codeHash, linkHash, expiresAt, attempts, sentAt, sendCount, windowStart });
    } catch (error) {
      this.logger.warn(`Could not restore the earlier verification code: ${(error as Error).message}`);
    }
  }

  /** Seconds left before another email may go out (0 = now). */
  private resendWait(entry: EmailVerification, now: number): number {
    return Math.max(0, Math.ceil((RESEND_SECONDS * 1000 - (now - entry.sentAt.getTime())) / 1000));
  }

  private async markVerified(userId: string): Promise<void> {
    await this.users.update(userId, { emailVerifiedAt: new Date() });
    await this.verifications.delete({ userId });
    this.logger.log(`Email verified for user ${userId}.`);
  }

  private hash(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('hex');
  }

  private same(a: string, b: string): boolean {
    return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
