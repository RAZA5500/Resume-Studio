import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/app/dashboard']) : true;
};

/** Admin pages; the API enforces the same check (ADMIN_EMAILS in backend/.env). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.user()?.isAdmin) return true;
  // The cached profile may predate admin access, so ask the server before redirecting.
  const home = router.createUrlTree(['/app/dashboard']);
  return auth.refreshProfile().pipe(
    map((user) => (user.isAdmin ? true : home)),
    catchError(() => of(home)),
  );
};
