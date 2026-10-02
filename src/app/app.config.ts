import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  Injector,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { isNativeApp } from './core/native/platform';
import { apiUrlInterceptor } from './core/services/api-url.interceptor';
import { authInterceptor } from './core/services/auth.interceptor';
import { IdlePreloading } from './core/services/idle-preloading';
import { PerfService } from './core/services/perf.service';
import { watchForAppUpdates } from './core/services/pwa-updates';

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
      watchForAppUpdates();
      // Android app: splash screen, system bars, back button, downloads (lazy chunk, never on the web).
      if (isNativeApp()) {
        const injector = inject(Injector);
        return import('./core/native/native-app').then((m) => m.initNativeApp(injector));
      }
      return undefined;
    }),
    // Offline-capable app shell: repeat visits start from the cache instead of the network.
    // Not used in the Android app, which already loads everything from the phone.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !isNativeApp(),
      registrationStrategy: 'registerWhenStable:30000',
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
