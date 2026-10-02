import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { rootCertificates } from 'node:tls';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';
import { SUPABASE_ROOT_CA_2021 } from './supabase-ca.js';

export type PostgresOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

export const MIGRATIONS_TABLE = 'typeorm_migrations';

/** Injection token of the resolved {@link DatabaseConfig}. */
export const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

/** Credentials of the local docker-compose.yml database, used when nothing else is configured. */
const LOCAL_DEFAULTS = { user: 'resumestudio', password: 'resumestudio_secret', database: 'resumestudio' };

/** Where the app connects to. Safe to log: never contains the password. */
export interface DatabaseTarget {
  host: string;
  port: number;
  user: string;
  database: string;
  /** The setting that described the server. */
  source: 'DATABASE_URL' | 'DATABASE_HOST' | 'SUPABASE_URL' | 'defaults';
  passwordSource: 'DATABASE_URL' | 'DATABASE_PASSWORD' | 'docker-compose default' | 'none';
  ssl: 'off' | 'verified' | 'not verified';
  kind: 'supabase-session-pooler' | 'supabase-transaction-pooler' | 'supabase-direct' | 'local' | 'remote';
}

export interface DatabaseConfig {
  options: PostgresOptions;
  target: DatabaseTarget;
  /** Settings that make connecting pointless (missing password, unusable URL…). Nothing is attempted. */
  problems: string[];
  /** Worth a log line; the app still connects. */
  warnings: string[];
}

/**
 * Turns the environment into TypeORM options. Accepted settings, most specific first:
 *
 *  - DATABASE_URL  — e.g. the "Session pooler" string from Supabase → Connect. It may keep the
 *                    [YOUR-PASSWORD] placeholder: DATABASE_PASSWORD then supplies the password as is
 *                    (no percent-encoding needed).
 *  - DATABASE_HOST / _PORT / _USER / _PASSWORD / _NAME
 *  - SUPABASE_URL (+ DATABASE_PASSWORD) — derives the session pooler of that project
 *                    (region from SUPABASE_REGION, default ap-southeast-1, or SUPABASE_POOLER_HOST).
 *  - nothing       — the local docker-compose.yml database.
 *
 * SSL is on for every non-local server. Supabase certificates are verified against the bundled
 * Supabase root CA; DATABASE_SSL=no-verify|false|verify and DATABASE_SSL_CA override that.
 */
export function resolveDatabaseConfig(env: (key: string) => string | undefined): DatabaseConfig {
  const read = (key: string) => env(key)?.trim() || undefined;
  const problems: string[] = [];
  const warnings: string[] = [];
  const supabaseRef = supabaseProjectRef(read('SUPABASE_URL'));

  let source: DatabaseTarget['source'] = 'defaults';
  let host: string | undefined;
  let port: number | undefined;
  let user: string | undefined;
  let database: string | undefined;
  let urlPassword: string | undefined;
  let sslmode: string | undefined;

  const url = read('DATABASE_URL')?.replace(/^(["'])(.*)\1$/s, '$2');
  if (url) {
    const parsed = parseDatabaseUrl(url);
    if (!parsed) {
      problems.push('DATABASE_URL is not a valid postgresql://user:password@host:port/database connection string.');
    } else if (isPlaceholderHost(parsed.host)) {
      warnings.push('DATABASE_URL still contains a placeholder host such as [YOUR-REGION] and is ignored.');
    } else {
      source = 'DATABASE_URL';
      ({ host, port, user, database } = parsed);
      urlPassword = parsed.password;
      sslmode = parsed.params.get('sslmode')?.toLowerCase();
      if (parsed.port === undefined && parsed.rawPort) problems.push(`DATABASE_URL has an invalid port "${parsed.rawPort}".`);
    }
  }

  if (!host) {
    const envHost = read('DATABASE_HOST');
    if (supabaseRef && (!envHost || isLocalHost(envHost))) {
      source = 'SUPABASE_URL';
      host = read('SUPABASE_POOLER_HOST') ?? `aws-0-${read('SUPABASE_REGION') ?? 'ap-southeast-1'}.pooler.supabase.com`;
      port = 5432;
      user = `postgres.${supabaseRef}`;
      database = 'postgres';
      warnings.push(
        `Using the session pooler derived from SUPABASE_URL (${host}). If it cannot connect, set DATABASE_URL ` +
          'to the "Session pooler" connection string from Supabase → Connect.',
      );
    } else {
      if (envHost) source = 'DATABASE_HOST';
      host = envHost ?? 'localhost';
      const rawPort = read('DATABASE_PORT');
      port = rawPort === undefined ? 5432 : toPort(rawPort);
      if (port === undefined) problems.push(`DATABASE_PORT "${rawPort}" is not a valid port.`);
      user = read('DATABASE_USER');
      database = read('DATABASE_NAME');
    }
  }

  const local = isLocalHost(host);
  const kind = hostKind(host, port ?? 5432, local);
  const supabase = kind.startsWith('supabase');
  user ??= local ? LOCAL_DEFAULTS.user : 'postgres';
  database ??= local ? LOCAL_DEFAULTS.database : 'postgres';

  // Supavisor finds the project from the user name ("postgres.<project-ref>").
  if (kind === 'supabase-session-pooler' || kind === 'supabase-transaction-pooler') {
    if (!user.includes('.')) {
      if (supabaseRef) {
        warnings.push(`Supabase pooler user "${user}" has no project ref; using "${user}.${supabaseRef}" (from SUPABASE_URL).`);
        user = `${user}.${supabaseRef}`;
      } else {
        problems.push(
          `The Supabase pooler user must be "postgres.<project-ref>", not "${user}". ` +
            'Copy the "Session pooler" connection string from Supabase → Connect.',
        );
      }
    }
    if (kind === 'supabase-transaction-pooler') {
      warnings.push('Port 6543 is the transaction pooler. An always-on server should use the session pooler (port 5432).');
    }
  }
  if (kind === 'supabase-direct') {
    warnings.push(
      'db.<project>.supabase.co is reachable over IPv6 only. Hosts without IPv6 (most shared hosting) ' +
        'need the "Session pooler" connection string instead.',
    );
  }

  // The password: a real one inside DATABASE_URL wins, otherwise DATABASE_PASSWORD.
  const envPassword = read('DATABASE_PASSWORD');
  let password: string | undefined;
  let passwordSource: DatabaseTarget['passwordSource'] = 'none';
  if (urlPassword && !isPlaceholderPassword(urlPassword)) {
    password = urlPassword;
    passwordSource = 'DATABASE_URL';
    if (envPassword && envPassword !== urlPassword) {
      warnings.push('DATABASE_PASSWORD is ignored because DATABASE_URL already contains a password.');
    }
  } else if (envPassword) {
    password = envPassword;
    passwordSource = 'DATABASE_PASSWORD';
  } else if (local && source !== 'DATABASE_URL') {
    password = LOCAL_DEFAULTS.password;
    passwordSource = 'docker-compose default';
  }
  if (!password && !local) {
    problems.push(
      supabase
        ? 'The Supabase database password is missing. Set DATABASE_PASSWORD (Supabase → Project Settings → ' +
            'Database → "Reset database password" if you do not know it).'
        : 'The database password is missing. Set DATABASE_PASSWORD or put it in DATABASE_URL.',
    );
  } else if (supabase && password === LOCAL_DEFAULTS.password) {
    problems.push(
      `DATABASE_PASSWORD is the local docker-compose password (${LOCAL_DEFAULTS.password}), not your Supabase ` +
        'database password. Set the password of the Supabase project.',
    );
  }

  const ssl = resolveSsl(read('DATABASE_SSL'), sslmode, read('DATABASE_SSL_CA'), { local, supabase }, problems, warnings);

  const sync = read('DB_SYNC') === 'true';
  if (sync) {
    warnings.push('DB_SYNC=true: TypeORM alters tables straight from the entities and can drop columns. Prefer migrations.');
  }

  const options: PostgresOptions = {
    type: 'postgres',
    host,
    port: port ?? 5432,
    username: user,
    password,
    database,
    ssl: ssl.options,
    applicationName: 'resumestudio-api',
    connectTimeoutMS: toPositiveInt(read('DATABASE_CONNECT_TIMEOUT_MS')) ?? 15_000,
    // The Supabase free plan allows 15 pooled connections in total.
    poolSize: toPositiveInt(read('DATABASE_MAX_CONNECTIONS')) ?? 5,
    extra: { keepAlive: true, idleTimeoutMillis: 30_000 },
    // gen_random_uuid() is built into PostgreSQL 13+, so no extension has to be installed.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: MIGRATIONS_TABLE,
    // DatabaseService runs the migrations itself, under a lock, after connecting.
    migrationsRun: false,
    synchronize: sync,
    logging: ['warn', 'migration'],
  };

  return {
    options,
    target: { host, port: port ?? 5432, user, database, source, passwordSource, ssl: ssl.state, kind },
    problems,
    warnings,
  };
}

/** "postgres.abc@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres (Supabase session pooler, SSL verified)" */
export function describeTarget(target: DatabaseTarget): string {
  const kinds: Record<DatabaseTarget['kind'], string> = {
    'supabase-session-pooler': 'Supabase session pooler',
    'supabase-transaction-pooler': 'Supabase transaction pooler',
    'supabase-direct': 'Supabase direct connection',
    local: 'local database',
    remote: 'remote database',
  };
  const ssl = target.ssl === 'off' ? 'SSL off' : `SSL ${target.ssl}`;
  return (
    `${target.user}@${target.host}:${target.port}/${target.database} (${kinds[target.kind]}, ${ssl}, ` +
    `password: ${target.passwordSource}, from ${target.source})`
  );
}

// ---------------------------------------------------------------------------------------------------

interface ParsedUrl {
  host: string;
  port?: number;
  rawPort?: string;
  user?: string;
  password?: string;
  database?: string;
  params: URLSearchParams;
}

/**
 * Parses postgres:// and postgresql:// URLs. Unlike `new URL()` it accepts passwords that were pasted
 * without percent-encoding: the password runs up to the LAST "@", so "/", "#", "?" and "@" are fine.
 */
export function parseDatabaseUrl(value: string): ParsedUrl | null {
  const match =
    /^postgres(?:ql)?:\/\/(?:([^:@/?#]*)(?::(.*))?@)?(\[[^\]]*\]|[^:/?#@]*)(?::([^/?#]*))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#.*)?$/is.exec(
      value,
    );
  if (!match) return null;
  const [, user, password, rawHost, rawPort, database, query] = match;
  const host = decode(rawHost).replace(/^\[(.*)\]$/, (whole, inner: string) => (isIP(inner) === 6 ? inner : whole));
  if (!host) return null;
  return {
    host,
    port: rawPort ? toPort(rawPort) : undefined,
    rawPort: rawPort || undefined,
    user: user ? decode(user) : undefined,
    password: password === undefined ? undefined : decode(password),
    database: database ? decode(database) : undefined,
    params: new URLSearchParams(query ?? ''),
  };
}

function resolveSsl(
  flag: string | undefined,
  sslmode: string | undefined,
  caSetting: string | undefined,
  server: { local: boolean; supabase: boolean },
  problems: string[],
  warnings: string[],
): { options: PostgresOptions['ssl']; state: DatabaseTarget['ssl'] } {
  let mode: 'off' | 'on' | 'verify' | 'no-verify' | undefined;
  switch (flag?.toLowerCase()) {
    case undefined:
      break;
    case 'false':
    case '0':
    case 'off':
    case 'disable':
      mode = 'off';
      break;
    case 'true':
    case '1':
    case 'on':
    case 'require':
      mode = 'on';
      break;
    case 'verify':
    case 'verify-ca':
    case 'verify-full':
      mode = 'verify';
      break;
    case 'no-verify':
      mode = 'no-verify';
      break;
    default:
      warnings.push(`DATABASE_SSL="${flag}" is not one of true, false, verify, no-verify; SSL is chosen automatically.`);
  }
  if (!mode && sslmode) {
    mode = sslmode === 'disable' ? 'off' : sslmode === 'no-verify' ? 'no-verify' : sslmode.startsWith('verify') ? 'verify' : 'on';
  }
  mode ??= server.local ? 'off' : 'on';
  if (mode === 'off') return { options: false, state: 'off' };
  if (mode === 'no-verify') return { options: { rejectUnauthorized: false }, state: 'not verified' };

  let customCa: string | undefined;
  if (caSetting) {
    try {
      customCa = caSetting.includes('-----BEGIN') ? caSetting.replace(/\\n/g, '\n') : readFileSync(caSetting, 'utf8');
    } catch {
      problems.push(`DATABASE_SSL_CA: cannot read the certificate file "${caSetting}".`);
    }
  }
  // Like libpq's sslmode=require, other providers' certificates are only verified when asked to.
  if (mode === 'on' && !server.supabase && !customCa) return { options: { rejectUnauthorized: false }, state: 'not verified' };

  const ca = [...rootCertificates, ...(server.supabase ? [SUPABASE_ROOT_CA_2021] : []), ...(customCa ? [customCa] : [])];
  return { options: { ca, rejectUnauthorized: true }, state: 'verified' };
}

function hostKind(host: string, port: number, local: boolean): DatabaseTarget['kind'] {
  if (local) return 'local';
  if (/\.pooler\.supabase\.(com|co)$/i.test(host)) return port === 6543 ? 'supabase-transaction-pooler' : 'supabase-session-pooler';
  if (/\.supabase\.(co|com)$/i.test(host)) return 'supabase-direct';
  return 'remote';
}

/** localhost, loopback, private IPs and single-label names such as a docker-compose service ("postgres"). */
function isLocalHost(host: string): boolean {
  const name = host.toLowerCase();
  if (name === 'localhost' || name.endsWith('.localhost') || name === 'host.docker.internal') return true;
  if (isIP(name) === 4) return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$)/.test(name);
  if (isIP(name) === 6) return name === '::1' || /^f[cd]/.test(name);
  return !name.includes('.');
}

/** "aws-0-[YOUR-REGION].pooler.supabase.com" from a copied template. */
function isPlaceholderHost(host: string): boolean {
  return /[[\]<>]|YOUR[-_]/i.test(host);
}

/** "[YOUR-PASSWORD]" as copied from Supabase → Connect. */
function isPlaceholderPassword(password: string): boolean {
  return /^\[.*\]$|^<.*>$|YOUR[-_ ]?PASSWORD/is.test(password);
}

function supabaseProjectRef(url: string | undefined): string | undefined {
  return url ? /^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|com)\b/i.exec(url)?.[1]?.toLowerCase() : undefined;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toPort(value: string): number | undefined {
  const port = /^\d+$/.test(value) ? Number(value) : NaN;
  return port > 0 && port < 65536 ? port : undefined;
}

function toPositiveInt(value: string | undefined): number | undefined {
  const number = value && /^\d+$/.test(value) ? Number(value) : NaN;
  return number > 0 ? number : undefined;
}
