import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { apiUrlInterceptor } from './core/services/api-url.interceptor';
import { authInterceptor } from './core/services/auth.interceptor';
import { IdlePreloading } from './core/services/idle-preloading';
import { PerfService } from './core/services/perf.service';

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
    provideAppInitializer(() => {
      inject(PerfService);
    }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      // Code for the next pages downloads while the browser is idle (see IdlePreloading).
      withPreloading(IdlePreloading),
      // Animated page changes (View Transitions API); skipped when only the fragment or query changes,
      // and in the lite performance tier (a transition snapshots the whole page — slow on weak GPUs).
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          const lite = document.documentElement.dataset['perf'] === 'lite';
          if (lite || routePath(from) === routePath(to)) transition.skipTransition();
        },
      }),
    ),
    // authInterceptor must run first: it only adds the token to relative /api URLs.
    provideHttpClient(withInterceptors([authInterceptor, apiUrlInterceptor])),
  ],
};
