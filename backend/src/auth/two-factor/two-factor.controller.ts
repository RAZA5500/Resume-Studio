import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, type AuthUser } from '../../common/auth/auth.decorators.js';
import { AuthService } from '../auth.service.js';
import { TwoFactorCodeDto, TwoFactorVerifyDto } from '../dto/auth.dto.js';
import { TwoFactorService } from './two-factor.service.js';

/** Two-factor sign-in with an authenticator app. */
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly auth: AuthService,
  ) {}

  /** Starts setup: secret + QR code for the authenticator app. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('setup')
  setup(@CurrentUser() user: AuthUser) {
    return this.twoFactor.setup(user.id);
  }

  /** Confirms setup with a code from the app; answers with the backup codes (shown once). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('enable')
  enable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto, @Ip() ip: string) {
    return this.twoFactor.enable(user.id, dto.code, ip);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('disable')
  disable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto, @Ip() ip: string) {
    return this.twoFactor.disable(user.id, dto.code, ip);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('backup-codes')
  backupCodes(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto, @Ip() ip: string) {
    return this.twoFactor.regenerateBackupCodes(user.id, dto.code, ip);
  }

  /** Step two of signing in (after the password, or Google / Apple). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify')
  verify(@Body() dto: TwoFactorVerifyDto, @Ip() ip: string) {
    return this.auth.verifyTwoFactor(dto, ip);
  }
}
