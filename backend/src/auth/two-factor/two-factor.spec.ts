import { SecretBox } from './secret-box.js';
import { base32Decode, base32Encode, hotp, otpauthUri, verifyTotp } from './totp.js';

describe('TOTP (RFC 6238)', () => {
  const secret = Buffer.from('12345678901234567890');

  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const vectors: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, expected] of vectors) expect(hotp(secret, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it('round-trips base32 like authenticator apps expect', () => {
    expect(base32Encode(secret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq').equals(secret)).toBe(true);
    expect(() => base32Decode('not base32!')).toThrow();
  });

  it('accepts the current code and one step either side, but never a step twice', () => {
    const now = 1111111111 * 1000;
    const step = Math.floor(1111111111 / 30);
    expect(verifyTotp(secret, hotp(secret, step), null, now)).toBe(step);
    expect(verifyTotp(secret, hotp(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, hotp(secret, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(secret, hotp(secret, step - 2), null, now)).toBeNull();
    expect(verifyTotp(secret, hotp(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, '12345', null, now)).toBeNull();
  });

  it('builds the otpauth link for the QR code', () => {
    expect(otpauthUri('ResumeStudio', 'sara@example.com', 'ABC')).toBe(
      'otpauth://totp/ResumeStudio:sara%40example.com?secret=ABC&issuer=ResumeStudio&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('SecretBox', () => {
  it('encrypts with the first key and still opens values sealed with an older one', () => {
    const old = new SecretBox(['old-secret'], 'two-factor-secret');
    const current = new SecretBox(['new-secret', 'old-secret'], 'two-factor-secret');
    const sealed = old.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(current.open(sealed)).toEqual({ value: 'JBSWY3DPEHPK3PXP', stale: true });
    expect(current.open(current.seal('x'))).toEqual({ value: 'x', stale: false });
  });

  it('refuses tampered values and unknown keys', () => {
    const box = new SecretBox(['secret'], 'two-factor-secret');
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    const [version, iv, body] = sealed.split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 1;
    expect(box.open(`${version}.${iv}.${flipped.toString('base64url')}`)).toBeNull();
    expect(new SecretBox(['other'], 'two-factor-secret').open(sealed)).toBeNull();
    expect(box.open('garbage')).toBeNull();
    // Keys are separated by purpose as well.
    expect(new SecretBox(['secret'], 'another-purpose').open(sealed)).toBeNull();
  });
});
