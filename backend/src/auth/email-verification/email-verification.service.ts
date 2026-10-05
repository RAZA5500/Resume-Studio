import { createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { siteUrlFrom } from '../../common/site-url.js';
import { MailService } from '../../mail/mail.service.js';
import { verificationEmail } from '../../mail/templates.js';
import type { User } from '../../users/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import { TooManyAttemptsException } from '../security/auth-attempts.service.js';
import { EmailVerification } from './email-verification.entity.js';

/** How long a code and its link work. */
export const VERIFICATION_MINUTES = 30;
const RESEND_SECONDS = 60;
const SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

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
   * Emails a new code and link. Throws TooManyAttemptsException (with the seconds to wait) when the
   * previous email went out less than a minute ago or five were sent this hour.
   */
  async send(user: Pick<User, 'id' | 'email' | 'fullName' | 'emailVerifiedAt'>): Promise<{ retryAfter: number }> {
    if (!this.needsVerification(user)) throw rejected('ALREADY_VERIFIED', 'Your email address is already verified.');
    const now = Date.now();
    const previous = await this.verifications.findOneBy({ userId: user.id });
    if (previous) {
      const sinceLast = now - previous.sentAt.getTime();
      if (sinceLast < RESEND_SECONDS * 1000) {
        const wait = Math.ceil((RESEND_SECONDS * 1000 - sinceLast) / 1000);
        throw new TooManyAttemptsException(wait, `Please wait ${wait} seconds before asking for another email.`);
      }
      const windowAge = now - previous.windowStart.getTime();
      if (windowAge < 3600_000 && previous.sendCount >= SENDS_PER_HOUR) {
        const wait = Math.ceil((3600_000 - windowAge) / 1000);
        throw new TooManyAttemptsException(wait, `Too many emails were sent. Please try again in ${Math.ceil(wait / 60)} minutes.`);
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const token = randomBytes(32).toString('base64url');
    // The hourly count continues within the hour, and starts over after it.
    const window = previous && now - previous.windowStart.getTime() < 3600_000 ? previous : null;
    await this.verifications.save(
      this.verifications.create({
        userId: user.id,
        codeHash: this.hash(code),
        linkHash: this.hash(token),
        expiresAt: new Date(now + VERIFICATION_MINUTES * 60_000),
        attempts: 0,
        sentAt: new Date(now),
        sendCount: window ? window.sendCount + 1 : 1,
        windowStart: window ? window.windowStart : new Date(now),
      }),
    );
    await this.mail.send(
      verificationEmail({
        to: user.email,
        name: user.fullName,
        code,
        link: `${this.siteUrl}/verify-email?token=${token}`,
        minutes: VERIFICATION_MINUTES,
      }),
    );
    return { retryAfter: RESEND_SECONDS };
  }

  /** For sign-up and sign-in: emails a code unless one went out moments ago; never throws. */
  sendInBackground(user: Pick<User, 'id' | 'email' | 'fullName' | 'emailVerifiedAt'>): void {
    if (!this.needsVerification(user)) return;
    this.send(user).catch((error: unknown) => {
      if (error instanceof TooManyAttemptsException) return;
      this.logger.error(`Could not send the verification email to user ${user.id}: ${(error as Error).message}`);
    });
  }

  /** Checks a typed code; marks the email verified when it matches. */
  async verifyCode(userId: string, code: string): Promise<void> {
    const entry = await this.verifications.findOneBy({ userId });
    if (!entry || entry.expiresAt.getTime() < Date.now() || entry.attempts >= MAX_ATTEMPTS) {
      throw rejected('VERIFICATION_EXPIRED', 'This code has expired. Ask for a new email.');
    }
    if (!/^\d{6}$/.test(code) || !this.same(this.hash(code), entry.codeHash)) {
      await this.verifications.increment({ userId }, 'attempts', 1);
      const left = MAX_ATTEMPTS - entry.attempts - 1;
      throw rejected(
        left > 0 ? 'INVALID_VERIFICATION_CODE' : 'VERIFICATION_EXPIRED',
        left > 0 ? 'That code is not right. Use the code from the newest email.' : 'Too many wrong tries. Ask for a new email.',
      );
    }
    await this.markVerified(userId);
  }

  /** The link from the email (may be opened on another device); returns whose email it verified. */
  async verifyLink(token: string): Promise<string> {
    const entry = await this.verifications.findOneBy({ linkHash: this.hash(token) });
    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      throw rejected('VERIFICATION_EXPIRED', 'This link has expired or was already used. Ask for a new email in the app.');
    }
    await this.markVerified(entry.userId);
    return entry.userId;
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
