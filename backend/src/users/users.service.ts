import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

/** How long the auth guard trusts a cached session version (revocations here apply at once). */
const SESSION_CACHE_MS = 60_000;

@Injectable()
export class UsersService {
  private readonly sessions = new Map<string, { version: number; at: number }>();

  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

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

  create(data: Pick<User, 'email' | 'fullName' | 'passwordHash'>): Promise<User> {
    return this.users.save(this.users.create({ ...data, email: data.email.toLowerCase().trim() }));
  }

  async update(id: string, patch: Partial<Pick<User, 'fullName' | 'headline' | 'passwordHash'>>): Promise<User> {
    await this.users.update({ id }, patch);
    return this.findById(id);
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
