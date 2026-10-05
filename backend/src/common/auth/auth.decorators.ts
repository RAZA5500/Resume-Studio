import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  /** The user's tokenVersion when the token was issued (absent in tokens older than it, meaning 0). */
  tv?: number;
  /**
   * false while the account still has to verify its email address: such a token only opens
   * routes marked @AllowUnverified(). Absent in older tokens (treated as verified).
   */
  ev?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC_KEY = 'isPublic';
export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';

/** Marks a route as reachable without a token (the user is still attached when a valid token is sent). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Lets accounts that have not verified their email yet use this route (profile, verification, sign-out). */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user as AuthUser;
});
