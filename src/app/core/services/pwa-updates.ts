import { inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * The service worker serves the cached app instantly and downloads a new deployment in the
 * background. Once it is ready, the next page change does a full load so the visitor moves to
 * the new version without losing what is on screen. Call from an injection context.
 */
export function watchForAppUpdates(): void {
  const updates = inject(SwUpdate);
  if (!updates.isEnabled) return;
  const router = inject(Router);
  let ready = false;

  updates.versionUpdates.pipe(filter((event) => event.type === 'VERSION_READY')).subscribe(() => (ready = true));
  updates.unrecoverable.subscribe(() => location.reload());
  router.events
    .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
    .subscribe((event) => {
      if (ready) location.assign(event.url);
    });
}
