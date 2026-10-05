import { Body, Controller, HttpCode, Ip, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowUnverified, CurrentUser, Public, type AuthenticatedRequest, type AuthUser } from '../../common/auth/auth.decorators.js';
import { UsersService } from '../../users/users.service.js';
import { AuthService } from '../auth.service.js';
import { ChangeEmailDto, EmailCodeDto, EmailLinkDto } from '../dto/auth.dto.js';
import { EmailVerificationService } from './email-verification.service.js';

/** Email verification after sign-up, and at the first sign-in of older accounts. */
@Controller('auth/email')
export class EmailVerificationController {
  constructor(
    private readonly verification: EmailVerificationService,
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** The verification page calls this when it opens: emails a code + link unless the earlier one still works. */
  @AllowUnverified()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('send')
  async send(@CurrentUser() user: AuthUser) {
    return this.verification.send(await this.users.findById(user.id));
  }

  /** "Send a new code". */
  @AllowUnverified()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('resend')
  async resend(@CurrentUser() user: AuthUser) {
    return this.verification.resend(await this.users.findById(user.id));
  }

  /** The code typed into the app; answers with the updated profile. */
  @AllowUnverified()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify')
  async verify(@CurrentUser() user: AuthUser, @Body() dto: EmailCodeDto) {
    await this.verification.verifyCode(await this.users.findById(user.id), dto.code);
    return this.auth.me(user.id);
  }

  /** The link from the email — it may be opened on another device, where nobody is signed in. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-link')
  verifyLink(@Body() dto: EmailLinkDto, @Req() request: AuthenticatedRequest) {
    return this.verification.verifyLink(dto.token, request.user?.id, dto.confirm === true);
  }

  /** "Wrong email?": moves an unverified account to another address (the page then sends a new code). */
  @AllowUnverified()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Patch()
  changeEmail(@CurrentUser() user: AuthUser, @Body() dto: ChangeEmailDto, @Ip() ip: string) {
    return this.auth.changeEmail(user.id, dto, ip);
  }
}
