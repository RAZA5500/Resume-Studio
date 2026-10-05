import { createPublicKey, type JsonWebKey, type KeyObject, verify } from 'node:crypto';

/** Re-read a provider's keys at most this often when a token names an unknown key id. */
const MIN_REFRESH_MS = 60_000;
/** Providers rotate their keys; cached keys are re-read after this. */
const MAX_AGE_MS = 6 * 60 * 60_000;
/** Clock difference tolerated between us and the provider. */
const SKEW_SECONDS = 120;

export class IdTokenError extends Error {}

/** Signing keys of an identity provider (its JWKS endpoint), cached. */
export class JwksKeys {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private refreshing?: Promise<void>;

  constructor(
    private readonly url: string,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async get(kid: string): Promise<KeyObject | undefined> {
    const age = Date.now() - this.fetchedAt;
    if ((!this.keys.has(kid) && age > MIN_REFRESH_MS) || age > MAX_AGE_MS) await this.refresh();
    return this.keys.get(kid);
  }

  private refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        const response = await this.fetcher(this.url, { signal: AbortSignal.timeout(8_000) });
        if (!response.ok) throw new IdTokenError(`Key download failed (HTTP ${response.status})`);
        const { keys } = (await response.json()) as { keys?: (JsonWebKey & { kid?: string; use?: string })[] };
        const next = new Map<string, KeyObject>();
        for (const jwk of keys ?? []) {
          if (jwk.kty === 'RSA' && jwk.kid && (!jwk.use || jwk.use === 'sig')) next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
        }
        this.keys = next;
        this.fetchedAt = Date.now();
      } finally {
        this.refreshing = undefined;
      }
    })();
    return this.refreshing;
  }
}

function decodePart(part: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new IdTokenError('Malformed token');
  }
}

/**
 * Verifies an OpenID Connect ID token: RS256 signature with the provider's current keys, issuer,
 * audience (our client id), expiry and the nonce we sent — so a token issued for another app, an
 * old token or a replayed one is refused. Returns its claims.
 */
export async function verifyIdToken(
  token: string,
  keys: JwksKeys,
  expected: { issuers: string[]; audience: string; nonce: string; now?: number },
): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new IdTokenError('Malformed token');
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodePart(headerPart);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new IdTokenError('Unexpected token algorithm');

  const key = await keys.get(header.kid);
  if (!key) throw new IdTokenError('Unknown signing key');
  const signed = verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), key, Buffer.from(signaturePart, 'base64url'));
  if (!signed) throw new IdTokenError('Bad signature');

  const claims = decodePart(payloadPart);
  const now = expected.now ?? Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (typeof claims.iss !== 'string' || !expected.issuers.includes(claims.iss)) throw new IdTokenError('Wrong issuer');
  if (!audiences.includes(expected.audience)) throw new IdTokenError('Token is for another app');
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < now) throw new IdTokenError('Token expired');
  if (typeof claims.iat === 'number' && claims.iat - SKEW_SECONDS > now) throw new IdTokenError('Token from the future');
  if (claims.nonce !== expected.nonce) throw new IdTokenError('Nonce mismatch');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new IdTokenError('No subject');
  return claims;
}
