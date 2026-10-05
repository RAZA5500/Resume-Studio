import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service.js';
import { UsersService } from '../../users/users.service.js';
import { ALLOW_UNVERIFIED_KEY, IS_PUBLIC_KEY, type AuthenticatedRequest, type JwtPayload } from './auth.decorators.js';

/**
 * Global guard: every route needs a Bearer token unless decorated with @Public(). A token must be
 * correctly signed, unexpired, and still current for its account — changing the password or
 * signing out everywhere (users.tokenVersion) ends older tokens, and so does deleting the account.
 * Until an account has verified its email address, only @AllowUnverified() routes are open to it
 * (while the site can send email at all).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    private readonly mail: MailService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Please sign in to continue');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Your session has expired, please sign in again');
    }

    // A database error here propagates (a 5xx): a hiccup must not sign people out.
    const session = await this.users.session(payload.sub);
    if (!session || (payload.tv ?? 0) !== session.version) {
      if (isPublic) return true;
      throw new UnauthorizedException('You were signed out. Please sign in again.');
    }

    // Read from the account (not the token), so verifying on another device unlocks this one too.
    // Not enforced while email is off: nobody could receive a code then.
    if (!session.emailVerified && !isPublic && this.mail.enabled && !this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, targets)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address first.',
      });
    }

    request.user = { id: payload.sub, email: payload.email };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
