import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for values the server must read back later (authenticator secrets), so a
 * leaked database copy alone does not reveal them. Keys are derived (HKDF) from server secrets;
 * the first key encrypts, the others still open older values (e.g. after TWO_FACTOR_KEY is added),
 * and `stale` tells the caller to re-encrypt with the current key.
 */
export class SecretBox {
  private readonly keys: Buffer[];

  constructor(secrets: string[], purpose: string) {
    this.keys = secrets.map((secret) => Buffer.from(hkdfSync('sha256', secret, 'resumestudio', purpose, 32)));
    if (!this.keys.length) throw new Error('SecretBox needs at least one secret');
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys[0], iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return `v1.${iv.toString('base64url')}.${body.toString('base64url')}`;
  }

  open(sealed: string): { value: string; stale: boolean } | null {
    const [version, ivPart, bodyPart] = sealed.split('.');
    if (version !== 'v1' || !ivPart || !bodyPart) return null;
    const iv = Buffer.from(ivPart, 'base64url');
    const body = Buffer.from(bodyPart, 'base64url');
    if (body.length < 17) return null;
    for (const [index, key] of this.keys.entries()) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(body.subarray(body.length - 16));
        const value = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf8');
        return { value, stale: index > 0 };
      } catch {
        // wrong key — try the next one
      }
    }
    return null;
  }
}
