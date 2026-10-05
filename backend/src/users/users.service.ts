import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type IdentityProvider, UserIdentity } from './user-identity.entity.js';
import { User } from './user.entity.js';

/** How long the auth guard trusts a cached session state (changes made here apply at once). */
const SESSION_CACHE_MS = 60_000;

type UserPatch = Partial<
  Pick<
    User,
    | 'fullName'
    | 'headline'
    | 'passwordHash'
    | 'emailVerifiedAt'
    | 'twoFactorSecret'
    | 'twoFactorEnabledAt'
    | 'twoFactorLastStep'
    | 'twoFactorBackupCodes'
  >
>;

/** What the auth guard checks on every request. */
export interface SessionState {
  /** Tokens carry the version they were issued with; older ones are signed out. */
  version: number;
  emailVerified: boolean;
}

export interface TwoFactorState {
  secret: string | null;
  enabledAt: Date | null;
  lastStep: number | null;
  backupCodes: string[];
}

@Injectable()
export class UsersService {
  private readonly sessions = new Map<string, SessionState & { at: number }>();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserIdentity) private readonly identities: Repository<UserIdentity>,
  ) {}

  findByEmail(email: string, withPassword = false): Promise<User | null> {
    const query = this.users.createQueryBuilder('u').where('LOWER(u.email) = LOWER(:email)', { email: email.trim() });
    if (withPassword) query.addSelect('u.passwordHash');
    return query.getOne();
  }

  async findById(id: string, withPassword = false): Promise<User> {
    const query = this.users.createQueryBuilder('u').where('u.id = :id', { id });
    if (withPassword) query.addSelect('u.passwordHash');
    const user = await query.getOne();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  create(data: Pick<User, 'email' | 'fullName' | 'passwordHash'> & Partial<Pick<User, 'emailVerifiedAt'>>): Promise<User> {
    return this.users.save(this.users.create({ ...data, email: data.email.toLowerCase().trim() }));
  }

  async update(id: string, patch: UserPatch): Promise<User> {
    await this.users.update({ id }, patch);
    if ('emailVerifiedAt' in patch) this.sessions.delete(id);
    return this.findById(id);
  }

  /** New address for an account that has not verified its email yet (it stays unverified). */
  async changeEmail(id: string, email: string): Promise<User> {
    await this.users.update({ id }, { email: email.toLowerCase().trim(), emailVerifiedAt: null });
    this.sessions.delete(id);
    return this.findById(id);
  }

  /** What the profile shows under sign-in & security. */
  async loginMethods(
    id: string,
  ): Promise<{ hasPassword: boolean; providers: IdentityProvider[]; twoFactorEnabled: boolean; backupCodesLeft: number }> {
    const [row, identities] = await Promise.all([
      this.users
        .createQueryBuilder('u')
        .select('u.passwordHash IS NOT NULL', 'hasPassword')
        .addSelect('u.twoFactorEnabledAt IS NOT NULL', 'twoFactorEnabled')
        .addSelect('COALESCE(jsonb_array_length(u.twoFactorBackupCodes), 0)', 'backupCodesLeft')
        .where('u.id = :id', { id })
        .getRawOne<{ hasPassword: boolean; twoFactorEnabled: boolean; backupCodesLeft: number | string }>(),
      this.identities.find({ where: { userId: id }, select: { provider: true }, order: { provider: 'ASC' } }),
    ]);
    return {
      hasPassword: !!row?.hasPassword,
      providers: [...new Set(identities.map((identity) => identity.provider))],
      twoFactorEnabled: !!row?.twoFactorEnabled,
      backupCodesLeft: Number(row?.backupCodesLeft ?? 0),
    };
  }

  async twoFactorState(id: string): Promise<TwoFactorState> {
    const row = await this.users.findOne({
      where: { id },
      select: { id: true, twoFactorSecret: true, twoFactorEnabledAt: true, twoFactorLastStep: true, twoFactorBackupCodes: true },
    });
    if (!row) throw new NotFoundException('User not found');
    return {
      secret: row.twoFactorSecret,
      enabledAt: row.twoFactorEnabledAt,
      lastStep: row.twoFactorLastStep,
      backupCodes: row.twoFactorBackupCodes ?? [],
    };
  }

  /** Records an accepted authenticator step; false if this step (or a later one) was already used. */
  async useTotpStep(id: string, step: number): Promise<boolean> {
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({ twoFactorLastStep: step })
      .where('id = :id AND ("twoFactorLastStep" IS NULL OR "twoFactorLastStep" < :step)', { id, step })
      .execute();
    return result.affected === 1;
  }

  /** Removes one backup code (by hash) in a single statement, so a code works only once even under races. */
  async useBackupCode(id: string, hash: string): Promise<boolean> {
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({ twoFactorBackupCodes: () => `"twoFactorBackupCodes" - CAST(:hash AS text)` })
      .where('id = :id AND jsonb_exists("twoFactorBackupCodes", :hash)', { id, hash })
      .execute();
    return result.affected === 1;
  }

  findIdentity(provider: IdentityProvider, subject: string): Promise<UserIdentity | null> {
    return this.identities.findOne({ where: { provider, subject } });
  }

  async linkIdentity(userId: string, provider: IdentityProvider, subject: string, email: string | null): Promise<void> {
    await this.identities.save(this.identities.create({ userId, provider, subject, email, lastUsedAt: new Date() }));
  }

  async touchIdentity(identity: UserIdentity, email: string | null): Promise<void> {
    await this.identities.update({ id: identity.id }, { lastUsedAt: new Date(), ...(email && { email }) });
  }

  /**
   * The account's current session version and email status, checked on every authenticated request
   * (cached for a minute). Null when the account no longer exists.
   */
  async session(id: string): Promise<SessionState | null> {
    const cached = this.sessions.get(id);
    if (cached && Date.now() - cached.at < SESSION_CACHE_MS) return { version: cached.version, emailVerified: cached.emailVerified };
    const row = await this.users.findOne({ where: { id }, select: { id: true, tokenVersion: true, emailVerifiedAt: true } });
    if (!row) {
      this.sessions.delete(id);
      return null;
    }
    return this.remember(id, row);
  }

  /** Signs the account out on every device: tokens issued before now stop working. Returns the new version. */
  async revokeSessions(id: string): Promise<number> {
    await this.users.increment({ id }, 'tokenVersion', 1);
    const row = await this.users.findOne({ where: { id }, select: { id: true, tokenVersion: true, emailVerifiedAt: true } });
    if (!row) throw new NotFoundException('User not found');
    return this.remember(id, row).version;
  }

  private remember(id: string, row: Pick<User, 'tokenVersion' | 'emailVerifiedAt'>): SessionState {
    if (this.sessions.size >= 10_000) this.sessions.clear();
    const state = { version: row.tokenVersion, emailVerified: !!row.emailVerifiedAt };
    this.sessions.set(id, { ...state, at: Date.now() });
    return state;
  }
}
