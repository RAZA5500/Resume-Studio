import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { AuthAttemptsService, maskEmail, TooManyAttemptsException } from './auth-attempts.service.js';
import { BCRYPT_COST, PasswordHasher } from './password-hasher.service.js';
import { breachCount, passwordProblem } from './password-policy.js';
import { type PowChallenge, ProofOfWorkService } from './proof-of-work.service.js';

const MINUTE = 60_000;

function configOf(env: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function quietAttempts(start = 1_000_000) {
  const attempts = new AuthAttemptsService();
  Object.assign(attempts, { logger: { warn: () => undefined } });
  let now = start;
  attempts.now = () => now;
  return { attempts, advance: (ms: number) => (now += ms) };
}

function lockSeconds(run: () => void): number | null {
  try {
    run();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(TooManyAttemptsException);
    return (error as TooManyAttemptsException).retryAfter;
  }
}

/** Solves a challenge the way the app does (brute force over 0..maxnumber). */
function solve(challenge: PowChallenge, number?: number): string {
  let found = number;
  for (let n = 0; found === undefined && n <= challenge.maxnumber; n++) {
    if (createHash('sha256').update(challenge.salt + n).digest('hex') === challenge.challenge) found = n;
  }
  const payload = { algorithm: challenge.algorithm, challenge: challenge.challenge, number: found, salt: challenge.salt, signature: challenge.signature };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

describe('AuthAttemptsService', () => {
  it('locks an email on one network after 5 failures, for 15 minutes, then doubles the lock', () => {
    const { attempts, advance } = quietAttempts();
    for (let i = 0; i < 4; i++) attempts.loginFailed('sara@example.com', '1.1.1.1');
    expect(lockSeconds(() => attempts.assertLoginAllowed('sara@example.com', '1.1.1.1'))).toBeNull();
    attempts.loginFailed('sara@example.com', '1.1.1.1');
    expect(lockSeconds(() => attempts.assertLoginAllowed('sara@example.com', '1.1.1.1'))).toBe(15 * 60);
    // Another network can still sign in to that account.
    expect(lockSeconds(() => attempts.assertLoginAllowed('sara@example.com', '2.2.2.2'))).toBeNull();

    advance(15 * MINUTE + 1);
    expect(lockSeconds(() => attempts.assertLoginAllowed('sara@example.com', '1.1.1.1'))).toBeNull();
    for (let i = 0; i < 5; i++) attempts.loginFailed('sara@example.com', '1.1.1.1');
    expect(lockSeconds(() => attempts.assertLoginAllowed('sara@example.com', '1.1.1.1'))).toBe(30 * 60);
  });

  it('locks an email attacked from many networks, and a network that tries many emails', () => {
    const { attempts } = quietAttempts();
    for (let i = 0; i < 20; i++) attempts.loginFailed('victim@example.com', `10.0.0.${i}`);
    expect(lockSeconds(() => attempts.assertLoginAllowed('victim@example.com', '9.9.9.9'))).toBe(30 * 60);

    for (let i = 0; i < 50; i++) attempts.loginFailed(`user${i}@example.com`, '6.6.6.6');
    expect(lockSeconds(() => attempts.assertLoginAllowed('fresh@example.com', '6.6.6.6'))).toBe(30 * 60);
    expect(lockSeconds(() => attempts.assertLoginAllowed('fresh@example.com', '7.7.7.7'))).toBeNull();
  });

  it('forgets failures after a correct password, and old failures slide out of the window', () => {
    const { attempts, advance } = quietAttempts();
    for (let i = 0; i < 4; i++) attempts.loginFailed('sara@example.com', '1.1.1.1');
    attempts.loginSucceeded('sara@example.com', '1.1.1.1');
    for (let i = 0; i < 4; i++) attempts.loginFailed('sara@example.com', '1.1.1.1');
    expect(lockSeconds(() => attempts.assertLoginAllowed('sara@example.com', '1.1.1.1'))).toBeNull();
    advance(16 * MINUTE);
    attempts.loginFailed('sara@example.com', '1.1.1.1');
    expect(lockSeconds(() => attempts.assertLoginAllowed('sara@example.com', '1.1.1.1'))).toBeNull();
  });

  it('pauses sign-ups from a network that creates many accounts or probes taken emails', () => {
    const { attempts } = quietAttempts();
    for (let i = 0; i < 19; i++) attempts.signupCreated('3.3.3.3');
    expect(lockSeconds(() => attempts.assertSignupAllowed('3.3.3.3'))).toBeNull();
    attempts.signupCreated('3.3.3.3');
    expect(lockSeconds(() => attempts.assertSignupAllowed('3.3.3.3'))).toBe(60 * 60);

    for (let i = 0; i < 10; i++) attempts.signupTaken('4.4.4.4');
    expect(lockSeconds(() => attempts.assertSignupAllowed('4.4.4.4'))).toBe(60 * 60);
  });

  it('says how long to wait in words', () => {
    const { attempts } = quietAttempts();
    for (let i = 0; i < 5; i++) attempts.loginFailed('sara@example.com', '1.1.1.1');
    expect(() => attempts.assertLoginAllowed('sara@example.com', '1.1.1.1')).toThrow(
      'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
    );
    expect(maskEmail('sara.khan@gmail.com')).toBe('s***@gmail.com');
  });
});

describe('ProofOfWorkService', () => {
  function service(env: Record<string, string> = {}) {
    const pow = new ProofOfWorkService(configOf({ AUTH_POW_MAX_NUMBER: '2000', ...env }));
    let now = Date.now();
    pow.now = () => now;
    return { pow, advance: (ms: number) => (now += ms) };
  }

  it('accepts a solved challenge once', () => {
    const { pow } = service();
    const challenge = pow.issue();
    expect(challenge).toMatchObject({ algorithm: 'SHA-256', maxnumber: 2000 });
    const payload = solve(challenge);
    expect(pow.verify(payload)).toBe('ok');
    expect(pow.verify(payload)).toBe('invalid');
  });

  it('rejects missing, wrong, forged and expired answers', () => {
    const { pow, advance } = service();
    expect(pow.verify(undefined)).toBe('missing');
    expect(pow.verify('not base64 json')).toBe('invalid');

    const challenge = pow.issue();
    const right = JSON.parse(Buffer.from(solve(challenge), 'base64').toString()) as { number: number };
    expect(pow.verify(solve(challenge, right.number + 1))).toBe('invalid');
    expect(pow.verify(solve({ ...challenge, signature: 'ab'.repeat(32) }))).toBe('invalid');
    // A challenge from another server instance (different key).
    expect(pow.verify(solve(service().pow.issue()))).toBe('invalid');

    const late = pow.issue();
    advance(11 * MINUTE);
    expect(pow.verify(solve(late))).toBe('invalid');
  });

  it('can be switched off', () => {
    expect(service({ AUTH_PROOF_OF_WORK: 'false' }).pow.verify(undefined)).toBe('ok');
  });
});

describe('passwordProblem', () => {
  it('accepts reasonable passwords', () => {
    expect(passwordProblem('correct horse battery', { email: 'sara@example.com', name: 'Sara Khan' })).toBeNull();
    expect(passwordProblem('Lahore-Rains-2026!')).toBeNull();
    expect(passwordProblem('میرا پاسورڈ محفوظ ہے')).toBeNull();
  });

  it('rejects short, too long, common, repetitive and sequential passwords', () => {
    expect(passwordProblem('short1')).toMatch(/at least 8/);
    expect(passwordProblem('ü'.repeat(40))).toMatch(/too long/);
    for (const weak of ['password123', 'Pakistan@123', '12345678', 'aaaaaaaa', '12121212', 'abcdefgh', 'qwertyuiop', '87654321', 'Bismillah786']) {
      expect(passwordProblem(weak)).toMatch(/too common/);
    }
  });

  it('rejects passwords made from the name, the email or the site', () => {
    const context = { email: 'ibsraza32@gmail.com', name: 'Sara Khan' };
    for (const personal of ['SaraKhan123', 'sara@2026', 'Khan1234', 'my-ibsraza32-pass', 'ResumeStudio!', 'resumestudio2026']) {
      expect(passwordProblem(personal, context)).toMatch(/name, your email/);
    }
  });
});

describe('breachCount', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only a 5-character hash prefix and finds the password in the padded answer', async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response('0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(breachCount('password')).resolves.toBe(9659365);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    await expect(breachCount('a much better password!')).resolves.toBe(0);
  });

  it('never blocks a sign-up when the service is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(breachCount('password')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(breachCount('password')).resolves.toBeNull();
  });
});

describe('PasswordHasher', () => {
  it('verifies, refuses missing hashes and spots outdated work factors', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('Lahore-Rains-2026!');
    await expect(hasher.verify('Lahore-Rains-2026!', hash)).resolves.toBe(true);
    await expect(hasher.verify('wrong password', hash)).resolves.toBe(false);
    await expect(hasher.verify('Lahore-Rains-2026!', null)).resolves.toBe(false);
    expect(hasher.needsRehash(hash)).toBe(false);
    expect(hasher.needsRehash(hash.replace(`$${BCRYPT_COST}$`, '$10$'))).toBe(true);
  });

  it('runs at most two hashes at a time and turns the rest away when the queue is full', async () => {
    const hasher = new PasswordHasher();
    let running = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const work = () =>
      (hasher as unknown as { limit: (job: () => Promise<void>) => Promise<void> }).limit(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running--;
      });
    const jobs = Array.from({ length: 52 }, () => work());
    await expect(work()).rejects.toThrow(/busy/);
    while (releases.length || running) {
      releases.shift()?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await Promise.all(jobs);
    expect(peak).toBe(2);
  });
});
