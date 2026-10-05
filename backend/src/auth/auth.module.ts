import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationController } from './email-verification/email-verification.controller.js';
import { EmailVerification } from './email-verification/email-verification.entity.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { createOAuthProviders } from './oauth/oauth-providers.js';
import { OAUTH_PROVIDERS, OAuthService } from './oauth/oauth.service.js';
import { AuthAttemptsService } from './security/auth-attempts.service.js';
import { PasswordHasher } from './security/password-hasher.service.js';
import { ProofOfWorkService } from './security/proof-of-work.service.js';
import { RefreshToken } from './sessions/refresh-token.entity.js';
import { RefreshTokenService } from './sessions/refresh-tokens.service.js';
import { SessionCookieInterceptor, SessionCookies } from './sessions/session-cookies.js';
import { TwoFactorController } from './two-factor/two-factor.controller.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([EmailVerification, RefreshToken]),
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
        // Access tokens are short-lived; the refresh token (JWT_EXPIRES_IN_DAYS) keeps the device signed in.
        const minutes = Number(config.get<string>('JWT_ACCESS_MINUTES') ?? 30);
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: (Number.isFinite(minutes) ? Math.min(Math.max(1, minutes), 24 * 60) : 30) * 60 },
          // Only the algorithm we sign with is accepted (no "none", no algorithm confusion).
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController, OAuthController, TwoFactorController, EmailVerificationController],
  providers: [
    AuthService,
    AuthAttemptsService,
    PasswordHasher,
    ProofOfWorkService,
    TwoFactorService,
    EmailVerificationService,
    RefreshTokenService,
    SessionCookies,
    SessionCookieInterceptor,
    OAuthService,
    { provide: OAUTH_PROVIDERS, inject: [ConfigService], useFactory: (config: ConfigService) => createOAuthProviders(config) },
  ],
})
export class AuthModule {}
