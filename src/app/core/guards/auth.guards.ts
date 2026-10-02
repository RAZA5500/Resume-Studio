import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { isNativeApp } from '../native/platform';
import { apiReady } from '../services/api-url.interceptor';
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

/** The Android app opens on the dashboard (or the log-in page), not on the marketing page. */
export const homeGuard: CanActivateFn = () =>
  isNativeApp()
    ? inject(Router).createUrlTree([inject(AuthService).isAuthenticated() ? '/app/dashboard' : '/login'])
    : true;

/** An APK built without API_URL needs a server address before any page can load data. */
export const serverGuard: CanActivateFn = (_route, state) =>
  apiReady() ? true : inject(Router).createUrlTree(['/connect'], { queryParams: { returnUrl: state.url } });
