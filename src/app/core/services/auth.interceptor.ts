import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { BillingService, UpgradeService } from './billing.service';

/** Adds the JWT to API calls and sends the user to /login when the session expires. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const upgrade = inject(UpgradeService);
  const billing = inject(BillingService);
  const token = auth.token();
  const authorized =
    token && request.url.startsWith('/api') ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 402) {
        // Free daily limit reached — show the upgrade dialog instead of an error toast.
        upgrade.show(typeof error.error === 'object' && error.error ? error.error : {});
        billing.refresh(true);
      }
      const isAuthCall = /\/api\/auth\/(login|register)/.test(request.url);
      if (error instanceof HttpErrorResponse && error.status === 401 && token && !isAuthCall) {
        auth.logout(false);
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url, expired: 1 } });
      }
      return throwError(() => error);
    }),
  );
};
