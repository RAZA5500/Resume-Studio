import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type IdentityProvider, UserIdentity } from './user-identity.entity.js';
import { User } from './user.entity.js';

/** How long the auth guard trusts a cached session version (revocations here apply at once). */
const SESSION_CACHE_MS = 60_000;

type UserPatch = Partial<Pick<User, 'fullName' | 'headline' | 'passwordHash' | 'emailVerifiedAt'>>;

@Injectable()
export class UsersService {
  private readonly sessions = new Map<string, { version: number; at: number }>();

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
    return this.findById(id);
  }

  /** What the profile shows under sign-in methods. */
  async loginMethods(id: string): Promise<{ hasPassword: boolean; providers: IdentityProvider[] }> {
    const [row, identities] = await Promise.all([
      this.users
        .createQueryBuilder('u')
        .select('u.passwordHash IS NOT NULL', 'hasPassword')
        .where('u.id = :id', { id })
        .getRawOne<{ hasPassword: boolean }>(),
      this.identities.find({ where: { userId: id }, select: { provider: true }, order: { provider: 'ASC' } }),
    ]);
    return { hasPassword: !!row?.hasPassword, providers: [...new Set(identities.map((identity) => identity.provider))] };
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
   * The account's current session version, checked on every authenticated request (cached for a
   * minute). Null when the account no longer exists.
   */
  async sessionVersion(id: string): Promise<number | null> {
    const cached = this.sessions.get(id);
    if (cached && Date.now() - cached.at < SESSION_CACHE_MS) return cached.version;
    const row = await this.users.findOne({ where: { id }, select: { id: true, tokenVersion: true } });
    if (!row) {
      this.sessions.delete(id);
      return null;
    }
    this.remember(id, row.tokenVersion);
    return row.tokenVersion;
  }

  /** Signs the account out on every device: tokens issued before now stop working. Returns the new version. */
  async revokeSessions(id: string): Promise<number> {
    await this.users.increment({ id }, 'tokenVersion', 1);
    const row = await this.users.findOne({ where: { id }, select: { id: true, tokenVersion: true } });
    if (!row) throw new NotFoundException('User not found');
    this.remember(id, row.tokenVersion);
    return row.tokenVersion;
  }

  private remember(id: string, version: number): void {
    if (this.sessions.size >= 10_000) this.sessions.clear();
    this.sessions.set(id, { version, at: Date.now() });
  }
}
