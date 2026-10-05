import { HttpErrorResponse, HttpEvent, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, defer, Observable, of, switchMap, throwError } from 'rxjs';
import { AuthService, tokenExpiring } from './auth.service';
import { BillingService, UpgradeService } from './billing.service';

/** Calls that start, renew or end a session themselves: no access token, no refresh around them. */
const SESSION_CALL = /^\/api\/auth\/(login|register|refresh|logout|challenge|providers|oauth\/|2fa\/verify)/;

/**
 * Adds the access token to API calls and keeps it fresh: it is renewed with the refresh token
 * (an httpOnly cookie) shortly before it runs out, and once more if the API still answers 401.
 * Only when that fails too is the visitor sent to /login. Also sends them to /verify-email when
 * the API says the email address still needs confirming.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api')) return next(request);
  const auth = inject(AuthService);
  const router = inject(Router);
  const upgrade = inject(UpgradeService);
  const billing = inject(BillingService);

  // The refresh cookie only travels with /api/auth calls; credentials let it cross to an API on another domain.
  const prepared = request.url.startsWith('/api/auth/') ? request.clone({ withCredentials: true }) : request;
  const token = auth.token();
  if (!token || SESSION_CALL.test(request.url)) return next(prepared).pipe(catchError((error: unknown) => handleError(error, null)));

  const send = (accessToken: string) => next(prepared.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }));

  return defer(() => {
    const expiring = tokenExpiring(token);
    let renewed = expiring;
    return (expiring ? auth.refresh() : of(token)).pipe(
      switchMap((accessToken) =>
        send(accessToken).pipe(
          catchError((error: unknown) => {
            if (!(error instanceof HttpErrorResponse) || error.status !== 401 || renewed) return throwError(() => error);
            // The token was turned down (expired early, server restart with a new secret…): renew once and retry.
            renewed = true;
            const current = auth.token();
            const retryToken = current && current !== accessToken && !tokenExpiring(current) ? of(current) : auth.refresh();
            return retryToken.pipe(
              // A refused refresh means the session is over (the 401 signs out); a network error does not.
              catchError((refreshError: unknown) => throwError(() => (sessionRefused(refreshError) ? error : refreshError))),
              switchMap(send),
            );
          }),
        ),
      ),
    );
  }).pipe(catchError((error: unknown) => handleError(error, token)));

  /** `usedToken`: the session the request was sent with (null for sign-in calls and signed-out visitors). */
  function handleError(error: unknown, usedToken: string | null): Observable<HttpEvent<unknown>> {
    if (error instanceof HttpErrorResponse && error.status === 402) {
      // Free daily limit reached — show the upgrade dialog instead of an error toast.
      upgrade.show(typeof error.error === 'object' && error.error ? error.error : {});
      billing.refresh(true);
    }
    // The session is over (the refresh failed too). Several requests can fail together; only the
    // first one, while this session is still the current one, signs out and redirects.
    if (error instanceof HttpErrorResponse && error.status === 401 && usedToken && sameSession(usedToken)) {
      // On a fresh page load the 401 arrives while the first navigation is still running and
      // router.url is still "/", so prefer the URL being navigated to.
      const navigation = router.currentNavigation();
      const target = navigation ? router.serializeUrl(navigation.finalUrl ?? navigation.extractedUrl) : router.url;
      auth.logout(false);
      const returnUrl = target === '/' || target.startsWith('/login') ? undefined : target;
      void router.navigate(['/login'], { queryParams: { returnUrl, expired: 1 } });
    }
    if (
      error instanceof HttpErrorResponse &&
      error.status === 403 &&
      (error.error as { code?: string } | null)?.code === 'EMAIL_NOT_VERIFIED' &&
      usedToken &&
      auth.token()
    ) {
      auth.patchUser({ emailVerified: false, mustVerifyEmail: true });
      const navigation = router.currentNavigation();
      const target = navigation ? router.serializeUrl(navigation.finalUrl ?? navigation.extractedUrl) : router.url;
      if (!target.startsWith('/verify-email')) {
        void router.navigate(['/verify-email'], { queryParams: { returnUrl: target === '/' ? undefined : target } });
      }
    }
    return throwError(() => error);
  }

  /** Still signed in with the session the request started with (possibly renewed meanwhile). */
  function sameSession(usedToken: string): boolean {
    const current = auth.token();
    return !!current && (current === usedToken || tokenSubject(current) === tokenSubject(usedToken));
  }
};

function sessionRefused(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 400);
}

/** The account a token belongs to ("sub"), to tell a renewed token from another sign-in. */
function tokenSubject(token: string): string | null {
  try {
    return (JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}
