import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { createOAuthProviders } from './oauth/oauth-providers.js';
import { OAUTH_PROVIDERS, OAuthService } from './oauth/oauth.service.js';
import { AuthAttemptsService } from './security/auth-attempts.service.js';
import { PasswordHasher } from './security/password-hasher.service.js';
import { ProofOfWorkService } from './security/proof-of-work.service.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('AuthModule');
        let secret = config.get<string>('JWT_SECRET')?.trim();
        if (!secret) {
          // A fixed fallback would let anyone who reads this code sign tokens; a random one only costs
          // the logins when the server restarts.
          secret = randomBytes(32).toString('hex');
          logger.warn('JWT_SECRET is not set — using a random secret, so logins end when the server restarts.');
        } else if (secret.length < 32) {
          logger.warn('JWT_SECRET is short — use at least 32 random characters so login tokens cannot be forged.');
        }
        const days = Number(config.get<string>('JWT_EXPIRES_IN_DAYS') ?? 7);
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: Math.max(1, days) * 24 * 60 * 60 },
          // Only the algorithm we sign with is accepted (no "none", no algorithm confusion).
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    AuthAttemptsService,
    PasswordHasher,
    ProofOfWorkService,
    OAuthService,
    { provide: OAUTH_PROVIDERS, inject: [ConfigService], useFactory: (config: ConfigService) => createOAuthProviders(config) },
  ],
})
export class AuthModule {}
