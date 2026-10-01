import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { apiUrlInterceptor } from './core/services/api-url.interceptor';
import { authInterceptor } from './core/services/auth.interceptor';

/** "app/ats/123" — the path of a router state, without query params or fragment. */
function routePath(snapshot: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  for (let route: ActivatedRouteSnapshot | null = snapshot; route; route = route.firstChild) {
    parts.push(...route.url.map((segment) => segment.path));
  }
  return parts.join('/');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      // Animated page changes (View Transitions API); skipped when only the fragment or query changes.
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          if (routePath(from) === routePath(to)) transition.skipTransition();
        },
      }),
    ),
    // authInterceptor must run first: it only adds the token to relative /api URLs.
    provideHttpClient(withInterceptors([authInterceptor, apiUrlInterceptor])),
  ],
};
