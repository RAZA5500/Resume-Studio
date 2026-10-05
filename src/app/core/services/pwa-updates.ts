import { inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

/** How often an open tab asks the server whether a new deployment is out. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The service worker serves the cached app instantly and downloads a new deployment in the
 * background. Once it is ready the visitor moves to it with a full load, at a moment that cannot
 * lose what is on screen: right away if they have not touched the page yet (a plain refresh after
 * a deploy shows the new version), otherwise on the next page change. Open tabs also look for
 * new deployments periodically and when they come back to the foreground. Call from an
 * injection context.
 */
export function watchForAppUpdates(): void {
  const updates = inject(SwUpdate);
  if (!updates.isEnabled) return;
  const router = inject(Router);
  let ready = false;
  let touched = false;

  const markTouched = () => (touched = true);
  for (const type of ['pointerdown', 'keydown'] as const) {
    addEventListener(type, markTouched, { once: true, capture: true, passive: true });
  }

  const check = () => updates.checkForUpdate().catch(() => undefined);

  updates.versionUpdates.pipe(filter((event) => event.type === 'VERSION_READY')).subscribe(() => {
    ready = true;
    if (!touched) location.reload();
  });
  updates.unrecoverable.subscribe(() => location.reload());
  router.events
    .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
    .subscribe((event) => {
      if (ready) location.assign(event.url);
    });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, CHECK_INTERVAL_MS);
}
