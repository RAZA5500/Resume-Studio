import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
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
}
