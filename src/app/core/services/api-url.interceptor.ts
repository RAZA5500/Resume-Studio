import { HttpInterceptorFn } from '@angular/common/http';

/** Replaced at build time by scripts/build.mjs (from the API_URL environment variable). */
declare const ngApiUrl: string | undefined;

/**
 * Origin of the backend, e.g. "https://api.example.com".
 * Empty (the default) means the API is served from the same domain under /api —
 * the setup used by the dev proxy and by the VPS / Docker deployment.
 */
export const API_URL = (typeof ngApiUrl === 'string' ? ngApiUrl : '').trim().replace(/\/+$/, '');

/** Sends /api/... requests to API_URL when the backend lives on another domain (e.g. Hostinger web hosting). */
export const apiUrlInterceptor: HttpInterceptorFn = (request, next) =>
  API_URL && request.url.startsWith('/api') ? next(request.clone({ url: API_URL + request.url })) : next(request);
