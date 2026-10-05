import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service.js';
import { IS_PUBLIC_KEY, type AuthenticatedRequest, type JwtPayload } from './auth.decorators.js';

/**
 * Global guard: every route needs a Bearer token unless decorated with @Public(). A token must be
 * correctly signed, unexpired, and still current for its account — changing the password or
 * signing out everywhere (users.tokenVersion) ends older tokens, and so does deleting the account.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
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
    const version = await this.users.sessionVersion(payload.sub);
    if (version === null || (payload.tv ?? 0) !== version) {
      if (isPublic) return true;
      throw new UnauthorizedException('You were signed out. Please sign in again.');
    }

    request.user = { id: payload.sub, email: payload.email };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
