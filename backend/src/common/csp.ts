import { createHash } from 'node:crypto';

/**
 * CSP sources ('sha256-…') for the inline <script> blocks of a page, so exactly those may run and
 * nothing else inline (index.html applies the theme before the first paint with one).
 */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter(([, body]) => body.trim())
    .map(([, body]) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
}
