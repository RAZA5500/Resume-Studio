import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        let secret = config.get<string>('JWT_SECRET')?.trim();
        if (!secret) {
          // A fixed fallback would let anyone who reads this code sign tokens; a random one only costs
          // the logins when the server restarts.
          secret = randomBytes(32).toString('hex');
          new Logger('AuthModule').warn('JWT_SECRET is not set — using a random secret, so logins end when the server restarts.');
        }
        const days = Number(config.get<string>('JWT_EXPIRES_IN_DAYS') ?? 7);
        return { secret, signOptions: { expiresIn: Math.max(1, days) * 24 * 60 * 60 } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
