import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth/auth.decorators.js';
import { BillingConfigService } from './billing-config.service.js';

/** Allows only accounts listed in ADMIN_EMAILS (runs after the global JWT guard). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: BillingConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!this.config.isAdmin(request.user?.email)) throw new ForbiddenException('Admin access only');
    return true;
  }
}
