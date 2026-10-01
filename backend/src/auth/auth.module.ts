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
        let secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          secret = 'dev-only-insecure-secret-change-me';
          new Logger('AuthModule').warn('JWT_SECRET is not set — using an insecure development secret.');
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
