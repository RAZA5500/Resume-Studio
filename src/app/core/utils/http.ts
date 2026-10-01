import { HttpErrorResponse } from '@angular/common/http';

function messageFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return typeof body === 'string' && body.length < 300 ? body : null;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string') return message;
  return null;
}

/** Human readable message for any HTTP / runtime error. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server. Please check your connection and try again.';
    // 402 = free plan limit; the upgrade dialog explains it, so no toast is needed.
    if (error.status === 402) return '';
    return messageFromBody(error.error) ?? (error.status === 413 ? 'The file is too large.' : fallback);
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

/** Same as errorMessage but also understands Blob error bodies (file downloads). */
export async function errorMessageAsync(error: unknown, fallback?: string): Promise<string> {
  if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
    try {
      const parsed = JSON.parse(await error.error.text()) as unknown;
      return messageFromBody(parsed) ?? errorMessage(error, fallback);
    } catch {
      return errorMessage(error, fallback);
    }
  }
  return errorMessage(error, fallback);
}

/** True when the server refused the request because a free daily limit was reached (HTTP 402). */
export function isLimitReached(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 402;
}
