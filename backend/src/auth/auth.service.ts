import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BillingConfigService } from '../billing/billing-config.service.js';
import type { JwtPayload } from '../common/auth/auth.decorators.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto.js';
import { AuthAttemptsService, maskEmail } from './security/auth-attempts.service.js';
import { PasswordHasher } from './security/password-hasher.service.js';
import { breachCount, passwordProblem } from './security/password-policy.js';
import { ProofOfWorkService } from './security/proof-of-work.service.js';

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

export type PublicUser = Pick<User, 'id' | 'email' | 'fullName' | 'headline' | 'plan' | 'planActivatedAt' | 'createdAt'> & {
  isAdmin: boolean;
};

/** 400 with a machine-readable code next to the message (the app reacts to some codes). */
function rejected(code: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message });
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string; driverError?: { code?: string } })?.driverError?.code === '23505' || (error as { code?: string })?.code === '23505';
}

const EMAIL_TAKEN = 'An account with this email already exists. Please log in instead.';

/**
 * Sign-up, sign-in and account security. Public forms pass a honeypot and a proof-of-work check,
 * brute force is locked out per account and per network (AuthAttemptsService), passwords follow
 * PasswordPolicy and are checked against known breaches, and changing the password signs out
 * every other session.
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

  async login(dto: LoginDto, ip: string): Promise<AuthResponse> {
    this.checkBot(dto, ip, 'sign-in');
    this.attempts.assertLoginAllowed(dto.email, ip);
    const user = await this.users.findByEmail(dto.email, true);
    // Unknown emails are hashed too, so the response time does not reveal which accounts exist.
    if (!(await this.hasher.verify(dto.password, user?.passwordHash)) || !user) {
      this.attempts.loginFailed(dto.email, ip);
      throw new UnauthorizedException('Invalid email or password');
    }
    this.attempts.loginSucceeded(dto.email, ip);
    if (this.hasher.needsRehash(user.passwordHash)) this.upgradeHash(user.id, dto.password);
    return this.issue(user);
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

  /** Changes the password, signs out every other session and returns a fresh token for this one. */
  async changePassword(userId: string, dto: ChangePasswordDto, ip: string): Promise<{ success: true; accessToken: string }> {
    // A stolen session must not be able to guess the current password either.
    const account = `user:${userId}`;
    this.attempts.assertLoginAllowed(account, ip);
    const user = await this.users.findById(userId, true);
    if (!(await this.hasher.verify(dto.currentPassword, user.passwordHash))) {
      this.attempts.loginFailed(account, ip);
      throw new BadRequestException('Current password is incorrect');
    }
    this.attempts.loginSucceeded(account, ip);
    if (dto.newPassword === dto.currentPassword) {
      throw rejected('WEAK_PASSWORD', 'Choose a new password that is different from the current one.');
    }
    const problem = passwordProblem(dto.newPassword, { email: user.email, name: user.fullName });
    if (problem) throw rejected('WEAK_PASSWORD', problem);
    await this.assertNotBreached(dto.newPassword);

    await this.users.update(userId, { passwordHash: await this.hasher.hash(dto.newPassword) });
    const version = await this.users.revokeSessions(userId);
    this.logger.log(`Password changed for ${maskEmail(user.email)}; other sessions signed out.`);
    return { success: true, accessToken: await this.sign(user, version) };
  }

  /** "Sign out everywhere": every token issued so far stops working, this one included. */
  async logoutEverywhere(userId: string): Promise<{ success: true }> {
    await this.users.revokeSessions(userId);
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
    return { accessToken: await this.sign(user, user.tokenVersion ?? 0), user: this.toPublic(user) };
  }

  private sign(user: Pick<User, 'id' | 'email'>, version: number): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email, tv: version };
    return this.jwt.signAsync(payload);
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      headline: user.headline ?? null,
      plan: user.plan ?? 'free',
      planActivatedAt: user.planActivatedAt ?? null,
      createdAt: user.createdAt,
      isAdmin: this.billing.isAdmin(user.email),
    };
  }
}
