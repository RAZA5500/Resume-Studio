import { inject, Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Downloads the code of likely next pages while the browser is idle, so the first visit to each
 * page opens instantly. Routes opt in with `data: { preload: true }` (everyone) or
 * `data: { preload: 'signed-in' }` (only after logging in). Nothing is preloaded on Data Saver
 * or 2G connections.
 */
@Injectable({ providedIn: 'root' })
export class IdlePreloading implements PreloadingStrategy {
  private readonly auth = inject(AuthService);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const mode = route.data?.['preload'];
    if (!mode || this.constrained()) return of(null);
    return whenIdle().pipe(
      switchMap(() => (mode === 'signed-in' && !this.auth.isAuthenticated() ? of(null) : load())),
    );
  }

  private constrained(): boolean {
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    return !!connection && (connection.saveData === true || /2g/.test(connection.effectiveType ?? ''));
  }
}

function whenIdle(): Observable<void> {
  return new Observable<void>((subscriber) => {
    const done = () => {
      subscriber.next();
      subscriber.complete();
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(done, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(done, 1200);
    return () => clearTimeout(id);
  });
}
