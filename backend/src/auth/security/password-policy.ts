import { createHash } from 'node:crypto';

/** bcrypt only reads the first 72 bytes; anything longer would be silently cut off. */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Passwords that attackers try first (8+ characters, lower case): the global top of the leaked
 * password lists plus the favourites in Pakistan. The breach check below catches the rest.
 */
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'password@123', 'passw0rd', 'p@ssw0rd',
  'p@ssword', 'pa$$word', 'pass@123', 'pass1234', 'mypassword', 'newpassword', 'changeme', 'changeme1',
  '12345678', '123456789', '1234567890', '0123456789', '987654321', '87654321', '11111111', '00000000',
  '12341234', '11223344', '12121212', '123123123', '147258369', '159753456', '1qaz2wsx', '!qaz2wsx',
  'zaq12wsx', '1q2w3e4r', '1q2w3e4r5t', 'q1w2e3r4', 'qwerty12', 'qwerty123', 'qwerty@123', 'qwertyui',
  'qwertyuiop', 'asdfghjk', 'asdfghjkl', 'asdf1234', 'asdfasdf', 'zxcvbnm1', 'zxcvbnm123', 'qazwsxedc',
  'abc12345', 'abcd1234', 'abcdefgh', 'aa123456', 'a1234567', 'a1b2c3d4', 'iloveyou', 'iloveyou1',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'batman123', 'trustno1', 'whatever',
  'computer', 'internet', 'welcome1', 'welcome123', 'welcome@123', 'letmein1', 'letmein123', 'admin123',
  'admin@123', 'administrator', 'master123', 'monkey123', 'dragon123', 'shadow123', 'michael1', 'jennifer',
  'starwars', 'freedom1', 'test1234', 'testtest', 'secret123', 'default1', 'google123', 'facebook',
  'instagram', 'whatsapp', 'samsung123', 'pakistan', 'pakistan1', 'pakistan123', 'pakistan786',
  'pakistan@123', 'pakistan1947', 'pakistani', 'pakistanzindabad', 'lahore123', 'karachi123', 'islamabad',
  'bismillah', 'bismillah1', 'bismillah786', 'allahuakbar', 'mashallah', 'inshallah', 'subhanallah',
  'muhammad', 'muhammad1', 'mohammad', 'muhammad786', 'ya ali madad', 'yaalimadad', '786786786',
  '78678678', '786123456', '1234567786', 'imrankhan', 'cricket123', 'babarazam', 'resume123',
  'myresume', 'cv123456', 'mycv1234',
]);

/** Keyboard rows and alphabets: any stretch of these (or the reverse) is guessed in seconds. */
const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc4rfv'];

function isSequence(lower: string): boolean {
  return SEQUENCES.some((run) => run.includes(lower) || [...run].reverse().join('').includes(lower));
}

/** Letters and digits only, lower case (Urdu and other scripts count as letters). */
function core(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Checks a new password (NIST SP 800-63B style: length, no well-known or context passwords, no
 * forced symbol rules). Returns the problem to show, or null when the password is acceptable.
 */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return 'Password is too long. Use at most 72 bytes (about 64 characters; emoji and non-Latin letters count more).';
  }
  const lower = password.toLowerCase();
  // One character, or a short pattern over and over: "aaaaaaaa", "12121212", "abcabcabc".
  if (/^(.{1,4})\1+$/su.test(lower) || COMMON.has(lower) || COMMON.has(core(password)) || isSequence(lower)) {
    return 'This password is too common and easy to guess. Please choose a stronger one.';
  }

  const stripped = core(password).replace(/\d+$/, '');
  const local = core(context.email?.split('@')[0] ?? '');
  const nameParts = (context.name ?? '').split(/\s+/).map(core).filter((part) => part.length >= 3);
  const personal = new Set([local, core(context.name ?? ''), ...nameParts, 'resumestudio'].filter(Boolean));
  if (personal.has(core(password)) || personal.has(stripped) || (local.length >= 5 && lower.includes(local))) {
    return 'Password must not be based on your name, your email or "ResumeStudio".';
  }
  return null;
}

/**
 * How often the password appears in known data breaches (Have I Been Pwned, k-anonymity: only the
 * first 5 characters of its SHA-1 hash leave the server, padded so even the answer size says
 * nothing). Returns null when the service cannot be reached, so sign-ups never depend on it.
 */
export async function breachCount(password: string, timeoutMs = 3_000): Promise<number | null> {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'ResumeStudio-password-check' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const suffix = hash.slice(5);
    for (const line of (await response.text()).split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}
