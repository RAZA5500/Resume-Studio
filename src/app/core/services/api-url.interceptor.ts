import { HttpInterceptorFn } from '@angular/common/http';
import { isNativeApp } from '../native/platform';

/** Replaced at build time by scripts/build.mjs (from the API_URL environment variable). */
declare const ngApiUrl: string | undefined;

/**
 * Origin of the backend baked into the build, e.g. "https://api.example.com".
 * Empty (the default) means the API is served from the same domain under /api —
 * the setup used by the dev proxy and by the VPS / Docker deployment.
 */
export const API_URL = (typeof ngApiUrl === 'string' ? ngApiUrl : '').trim().replace(/\/+$/, '');

const SERVER_KEY = 'rs_server';

/**
 * Where /api requests go. The Android app has no "own domain" to fall back to, so an APK built
 * without API_URL asks for the server address on first launch (ConnectPage) and keeps it here.
 */
export function apiOrigin(): string {
  if (API_URL || !isNativeApp()) return API_URL;
  try {
    return localStorage.getItem(SERVER_KEY) ?? '';
  } catch {
    return '';
  }
}

/** True when the app can be pointed at a server at runtime (an APK built without API_URL). */
export function serverIsConfigurable(): boolean {
  return isNativeApp() && !API_URL;
}

export function saveServerOrigin(origin: string): void {
  try {
    localStorage.setItem(SERVER_KEY, origin.trim().replace(/\/+$/, ''));
  } catch {
    // storage unavailable: the app asks again next launch
  }
}

/** Sends /api/... requests to the backend origin when it lives on another domain (Hostinger web hosting, the app). */
export const apiUrlInterceptor: HttpInterceptorFn = (request, next) => {
  const origin = apiOrigin();
  return origin && request.url.startsWith('/api') ? next(request.clone({ url: origin + request.url })) : next(request);
};
