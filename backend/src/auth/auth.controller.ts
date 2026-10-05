import { Body, Controller, Get, Header, HttpCode, Ip, Patch, Post, Req, Res, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowUnverified, CurrentUser, Public, type AuthUser } from '../common/auth/auth.decorators.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto.js';
import { refreshTokenFrom, SessionCookieInterceptor, SessionCookies } from './sessions/session-cookies.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookies,
  ) {}

  /** Proof-of-work puzzle the sign-in and sign-up forms solve before sending (see ProofOfWorkService). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Get('challenge')
  challenge() {
    return this.auth.challenge();
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(SessionCookieInterceptor)
  @Post('register')
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.auth.register(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @UseInterceptors(SessionCookieInterceptor)
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  /** A new access token for a device that is still signed in (refresh token from the cookie). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @UseInterceptors(SessionCookieInterceptor)
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      return await this.auth.refresh(refreshTokenFrom(request, dto?.refreshToken));
    } catch (error) {
      if (error instanceof UnauthorizedException) this.cookies.clear(request, response);
      throw error;
    }
  }

  /** Signs this device out: its refresh token stops working and the cookie is removed. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('logout')
  async logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.logout(refreshTokenFrom(request, dto?.refreshToken));
    this.cookies.clear(request, response);
    return result;
  }

  @AllowUnverified()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @UseInterceptors(SessionCookieInterceptor)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Ip() ip: string) {
    return this.auth.changePassword(user.id, dto, ip);
  }

  @AllowUnverified()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutEverywhere(user.id);
  }
}
