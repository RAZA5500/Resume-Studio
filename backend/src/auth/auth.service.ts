import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { BillingConfigService } from '../billing/billing-config.service.js';
import type { JwtPayload } from '../common/auth/auth.decorators.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto.js';

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

export type PublicUser = Pick<User, 'id' | 'email' | 'fullName' | 'headline' | 'plan' | 'planActivatedAt' | 'createdAt'> & {
  isAdmin: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly billing: BillingConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({ email: dto.email, fullName: dto.fullName.trim(), passwordHash });
    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmail(dto.email, true);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user);
  }

  async me(userId: string): Promise<PublicUser> {
    return this.toPublic(await this.users.findById(userId));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const user = await this.users.update(userId, {
      ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
      ...(dto.headline !== undefined && { headline: dto.headline.trim() || null }),
    });
    return this.toPublic(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ success: true }> {
    const user = await this.users.findById(userId, true);
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.users.update(userId, { passwordHash: await bcrypt.hash(dto.newPassword, 10) });
    return { success: true };
  }

  private async issue(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { accessToken: await this.jwt.signAsync(payload), user: this.toPublic(user) };
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
