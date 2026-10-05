import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BillingConfigService } from '../billing/billing-config.service.js';
import type { JwtPayload } from '../common/auth/auth.decorators.js';
import type { IdentityProvider } from '../users/user-identity.entity.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ChangeEmailDto, ChangePasswordDto, LoginDto, RegisterDto, TwoFactorVerifyDto, UpdateProfileDto } from './dto/auth.dto.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';
import { AuthAttemptsService, maskEmail } from './security/auth-attempts.service.js';
import { PasswordHasher } from './security/password-hasher.service.js';
import { breachCount, passwordProblem } from './security/password-policy.js';
import { ProofOfWorkService } from './security/proof-of-work.service.js';
import { RefreshTokenService, sessionExpired } from './sessions/refresh-tokens.service.js';
import { type TwoFactorChallenge, TwoFactorService } from './two-factor/two-factor.service.js';

export interface AuthResponse {
  /** Short-lived (JWT_ACCESS_MINUTES, default 30); the app renews it with the refresh token. */
  accessToken: string;
  /**
   * Long-lived, single use. SessionCookieInterceptor moves it into an httpOnly cookie; only the
   * Android app receives it in the body. Absent when a parallel refresh already replaced it.
   */
  refreshToken?: string;
  user: PublicUser;
  /** "Remember this device" token after a two-factor sign-in that asked for it. */
  trustedDevice?: string;
}

export type PublicUser = Pick<User, 'id' | 'email' | 'fullName' | 'headline' | 'plan' | 'planActivatedAt' | 'createdAt'> & {
  isAdmin: boolean;
  /** False for accounts that only sign in with Google / Apple (they can set one in the profile). */
  hasPassword: boolean;
  /** Linked sign-in providers. */
  providers: IdentityProvider[];
  twoFactorEnabled: boolean;
  backupCodesLeft: number;
  emailVerified: boolean;
  /** The app opens only the verification page until the email address is confirmed. */
  mustVerifyEmail: boolean;
};

/** 400 with a machine-readable code next to the message (the app reacts to some codes). */
function rejected(code: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message });
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string; driverError?: { code?: string } })?.driverError?.code === '23505' || (error as { code?: string })?.code === '23505';
}

const EMAIL_TAKEN = 'An account with this email already exists. Please log in instead.';
const EMAIL_IN_USE = 'Another account already uses this email address.';

/**
 * Sign-up, sign-in and account security. Public forms pass a honeypot and a proof-of-work check,
 * brute force is locked out per account and per network (AuthAttemptsService), passwords follow
 * PasswordPolicy and are checked against known breaches, changing the password signs out
 * every other session, and new accounts confirm their email address (EmailVerificationService).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private readonly breachCheck: boolean;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly billing: BillingConfigService,
    private readonly hasher: PasswordHasher,
    private readonly attempts: AuthAttemptsService,
    private readonly pow: ProofOfWorkService,
    private readonly twoFactor: TwoFactorService,
    private readonly verification: EmailVerificationService,
    private readonly sessions: RefreshTokenService,
    config: ConfigService,
  ) {
    this.breachCheck = !/^(0|false|off|no)$/i.test(config.get<string>('PASSWORD_BREACH_CHECK')?.trim() ?? '');
  }

  challenge() {
    return this.pow.issue();
  }

  async register(dto: RegisterDto, ip: string): Promise<AuthResponse> {
    this.checkBot(dto, ip, 'sign-up');
    this.attempts.assertSignupAllowed(ip);
    const problem = passwordProblem(dto.password, { email: dto.email, name: dto.fullName });
    if (problem) throw rejected('WEAK_PASSWORD', problem);
    if (await this.users.findByEmail(dto.email)) {
      this.attempts.signupTaken(ip);
      throw new ConflictException(EMAIL_TAKEN);
    }
    await this.assertNotBreached(dto.password);

    let user: User;
    try {
      user = await this.users.create({ email: dto.email, fullName: dto.fullName, passwordHash: await this.hasher.hash(dto.password) });
    } catch (error) {
      // Two sign-ups with the same email at once: the unique index decides.
      if (!isUniqueViolation(error)) throw error;
      this.attempts.signupTaken(ip);
      throw new ConflictException(EMAIL_TAKEN);
    }
    this.attempts.signupCreated(ip);
    this.logger.log(`New account ${maskEmail(user.email)} from ${ip}.`);
    return this.issue(user);
  }

  /** A session — or, with two-factor sign-in on, a challenge for POST auth/2fa/verify. */
  async login(dto: LoginDto, ip: string): Promise<AuthResponse | TwoFactorChallenge> {
    this.checkBot(dto, ip, 'sign-in');
    this.attempts.assertLoginAllowed(dto.email, ip);
    const user = await this.users.findByEmail(dto.email, true);
    // Unknown emails are hashed too, so the response time does not reveal which accounts exist.
    if (!(await this.hasher.verify(dto.password, user?.passwordHash)) || !user) {
      this.attempts.loginFailed(dto.email, ip);
      throw new UnauthorizedException('Invalid email or password');
    }
    this.attempts.loginSucceeded(dto.email, ip);
    if (user.passwordHash && this.hasher.needsRehash(user.passwordHash)) this.upgradeHash(user.id, dto.password);
    return this.sessionOrChallenge(user, dto.devices);
  }

  /** Step two of a sign-in with two-factor on: the app code (or a backup code) for the challenge. */
  async verifyTwoFactor(dto: TwoFactorVerifyDto, ip: string): Promise<AuthResponse> {
    const { userId } = await this.twoFactor.completeChallenge(dto.challenge, dto.code, ip);
    const user = await this.users.findById(userId);
    const session = await this.issue(user);
    const trustedDevice = dto.rememberDevice ? this.twoFactor.deviceToken(user) : null;
    return trustedDevice ? { ...session, trustedDevice } : session;
  }

  /** A session, unless two-factor sign-in is on and this device is not remembered (Google / Apple use this too). */
  sessionOrChallenge(user: User, devices?: readonly string[]): Promise<AuthResponse> | TwoFactorChallenge {
    return this.twoFactor.needsSecondStep(user, devices) ? this.twoFactor.createChallenge(user.id) : this.issue(user);
  }

  async me(userId: string): Promise<PublicUser> {
    return this.toPublic(await this.users.findById(userId));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const user = await this.users.update(userId, {
      ...(dto.fullName !== undefined && { fullName: dto.fullName }),
      ...(dto.headline !== undefined && { headline: dto.headline || null }),
    });
    return this.toPublic(user);
  }

  /**
   * Changes the password — or sets a first one on an account that signs in with Google / Apple —
   * signs out every other session and returns a fresh token for this one.
   */
  async changePassword(userId: string, dto: ChangePasswordDto, ip: string): Promise<{ success: true; accessToken: string; refreshToken: string }> {
    // A stolen session must not be able to guess the current password either.
    const account = `user:${userId}`;
    this.attempts.assertLoginAllowed(account, ip);
    const user = await this.users.findById(userId, true);
    if (user.passwordHash) {
      if (!dto.currentPassword || !(await this.hasher.verify(dto.currentPassword, user.passwordHash))) {
        this.attempts.loginFailed(account, ip);
        throw new BadRequestException('Current password is incorrect');
      }
      this.attempts.loginSucceeded(account, ip);
    }
    if (dto.newPassword === dto.currentPassword) {
      throw rejected('WEAK_PASSWORD', 'Choose a new password that is different from the current one.');
    }
    const problem = passwordProblem(dto.newPassword, { email: user.email, name: user.fullName });
    if (problem) throw rejected('WEAK_PASSWORD', problem);
    await this.assertNotBreached(dto.newPassword);

    await this.users.update(userId, { passwordHash: await this.hasher.hash(dto.newPassword) });
    const version = await this.users.revokeSessions(userId);
    await this.sessions.revokeAll(userId);
    this.logger.log(`Password ${user.passwordHash ? 'changed' : 'set'} for ${maskEmail(user.email)}; other sessions signed out.`);
    return { success: true, accessToken: await this.sign(user, version), refreshToken: await this.sessions.issue(userId, version) };
  }

  /**
   * "Wrong email?" on the verification page: moves an account that has not verified its address
   * to another one (password required, so a stolen session cannot redirect the account).
   */
  async changeEmail(userId: string, dto: ChangeEmailDto, ip: string): Promise<PublicUser> {
    const account = `user:${userId}`;
    this.attempts.assertLoginAllowed(account, ip);
    const user = await this.users.findById(userId, true);
    if (!user.passwordHash || !this.verification.needsVerification(user)) {
      throw rejected('EMAIL_CHANGE_UNAVAILABLE', 'The email address of this account can no longer be changed here.');
    }
    if (!(await this.hasher.verify(dto.password, user.passwordHash))) {
      this.attempts.loginFailed(account, ip);
      throw rejected('WRONG_PASSWORD', 'That password is not right.');
    }
    this.attempts.loginSucceeded(account, ip);
    if (dto.email === user.email) return this.toPublic(user);

    const taken = await this.users.findByEmail(dto.email);
    if (taken && taken.id !== userId) throw new ConflictException(EMAIL_IN_USE);
    let moved: User;
    try {
      moved = await this.users.changeEmail(userId, dto.email);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new ConflictException(EMAIL_IN_USE);
    }
    await this.verification.expireCode(userId);
    this.logger.log(`Unverified account moved from ${maskEmail(user.email)} to ${maskEmail(moved.email)}.`);
    return this.toPublic(moved);
  }

  /** "Sign out everywhere": every token issued so far stops working, this one included. */
  async logoutEverywhere(userId: string): Promise<{ success: true }> {
    await this.users.revokeSessions(userId);
    await this.sessions.revokeAll(userId);
    return { success: true };
  }

  /**
   * A new access token (and the next refresh token) for a device that is still signed in. Ends
   * with 401 when the refresh token expired, was replaced and reused, or belongs to sessions that
   * were signed out (password change, "sign out everywhere", deleted account).
   */
  async refresh(token: string | undefined): Promise<AuthResponse> {
    const entry = await this.sessions.find(token);
    let user: User | null;
    try {
      user = await this.users.findById(entry.userId);
    } catch (error) {
      // Only a missing account ends the session; a database hiccup must not sign anyone out.
      if (!(error instanceof NotFoundException)) throw error;
      user = null;
    }
    if (!user || (user.tokenVersion ?? 0) !== entry.tokenVersion) {
      await this.sessions.revokeFamily(entry.familyId);
      throw sessionExpired();
    }
    const refreshToken = await this.sessions.rotate(entry);
    const session: AuthResponse = { accessToken: await this.sign(user, entry.tokenVersion), user: await this.toPublic(user) };
    return refreshToken ? { ...session, refreshToken } : session;
  }

  /** Signing out on this device: its refresh token stops working. */
  async logout(token: string | undefined): Promise<{ success: true }> {
    await this.sessions.revoke(token);
    return { success: true };
  }

  /** Honeypot and proof of work: cheap checks that run before any password work. */
  private checkBot(dto: LoginDto | RegisterDto, ip: string, action: string): void {
    if (dto.website?.trim()) {
      this.logger.warn(`Bot trap filled on ${action} from ${ip}.`);
      throw rejected('BOT_DETECTED', 'Something went wrong. Please reload the page and try again.');
    }
    const verdict = this.pow.verify(dto.pow);
    if (verdict === 'missing') throw rejected('POW_REQUIRED', 'ResumeStudio was updated. Please reload the page and try again.');
    if (verdict === 'invalid') throw rejected('POW_INVALID', 'The security check expired. Please try again.');
  }

  private async assertNotBreached(password: string): Promise<void> {
    if (!this.breachCheck) return;
    if (await breachCount(password)) {
      throw rejected(
        'BREACHED_PASSWORD',
        'This password has appeared in a known data breach, so attackers try it first. Please choose a different one.',
      );
    }
  }

  /** Re-hashes an old, cheaper hash with the current work factor (in the background). */
  private upgradeHash(userId: string, password: string): void {
    this.hasher
      .hash(password)
      .then((passwordHash) => this.users.update(userId, { passwordHash }))
      .catch((error: unknown) => this.logger.warn(`Could not upgrade a password hash: ${(error as Error).message}`));
  }

  private async issue(user: User): Promise<AuthResponse> {
    const version = user.tokenVersion ?? 0;
    return {
      accessToken: await this.sign(user, version),
      refreshToken: await this.sessions.issue(user.id, version),
      user: await this.toPublic(user),
    };
  }

  private sign(user: Pick<User, 'id' | 'email'>, version: number): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email, tv: version };
    return this.jwt.signAsync(payload);
  }

  private async toPublic(user: User): Promise<PublicUser> {
    const { hasPassword, providers, twoFactorEnabled, backupCodesLeft } = await this.users.loginMethods(user.id);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      headline: user.headline ?? null,
      plan: user.plan ?? 'free',
      planActivatedAt: user.planActivatedAt ?? null,
      createdAt: user.createdAt,
      isAdmin: this.billing.isAdmin(user.email),
      hasPassword,
      providers,
      twoFactorEnabled,
      backupCodesLeft,
      emailVerified: !!user.emailVerifiedAt,
      mustVerifyEmail: this.verification.needsVerification(user),
    };
  }
}
