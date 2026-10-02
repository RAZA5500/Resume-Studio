import type { TlsOptions } from 'node:tls';
import { getMetadataArgsStorage, type QueryRunner } from 'typeorm';
import { MIGRATIONS_TABLE, resolveDatabaseConfig } from './database.config.js';
import { describeDatabaseError } from './database.errors.js';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';
import { SUPABASE_ROOT_CA_2021 } from './supabase-ca.js';

const REF = 'wrjjitiymcyxiatbfmky';
const POOLER = 'aws-0-ap-southeast-1.pooler.supabase.com';
const SESSION_POOLER_URL = `postgresql://postgres.${REF}:[YOUR-PASSWORD]@${POOLER}:5432/postgres`;

const resolve = (env: Record<string, string>) => resolveDatabaseConfig((key) => env[key]);
const tls = (env: Record<string, string>) => resolve(env).options.ssl as TlsOptions | false;

describe('resolveDatabaseConfig', () => {
  it('takes the Supabase session pooler string with [YOUR-PASSWORD] plus DATABASE_PASSWORD as is', () => {
    const { options, target, problems } = resolve({ DATABASE_URL: SESSION_POOLER_URL, DATABASE_PASSWORD: 'p@ss/w#rd?%' });
    expect(problems).toEqual([]);
    expect(options).toMatchObject({ host: POOLER, port: 5432, username: `postgres.${REF}`, database: 'postgres' });
    expect(options.password).toBe('p@ss/w#rd?%');
    expect(target).toMatchObject({ kind: 'supabase-session-pooler', passwordSource: 'DATABASE_PASSWORD', ssl: 'verified' });
  });

  it('verifies Supabase certificates with the bundled Supabase root CA', () => {
    const ssl = tls({ DATABASE_URL: SESSION_POOLER_URL, DATABASE_PASSWORD: 'x' });
    expect(ssl && ssl.rejectUnauthorized).toBe(true);
    expect(ssl && (ssl.ca as string[]).includes(SUPABASE_ROOT_CA_2021)).toBe(true);
  });

  it('refuses to connect to Supabase without a password', () => {
    expect(resolve({ DATABASE_URL: SESSION_POOLER_URL }).problems.join(' ')).toMatch(/password is missing/);
  });

  it('reads passwords pasted into DATABASE_URL raw or percent-encoded', () => {
    const raw = resolve({ DATABASE_URL: `postgresql://postgres.${REF}:p@ss/w#rd?%x:1@${POOLER}:5432/postgres` });
    const encoded = resolve({ DATABASE_URL: `postgresql://postgres.${REF}:p%40ss%2Fw%23rd%3F%25x%3A1@${POOLER}:5432/postgres` });
    for (const { options, problems } of [raw, encoded]) {
      expect(problems).toEqual([]);
      expect(options).toMatchObject({ host: POOLER, port: 5432, username: `postgres.${REF}`, password: 'p@ss/w#rd?%x:1' });
    }
  });

  it('prefers a real password in DATABASE_URL over a stale DATABASE_PASSWORD', () => {
    const { options, warnings } = resolve({
      DATABASE_URL: `postgresql://postgres.${REF}:right@${POOLER}:5432/postgres`,
      DATABASE_PASSWORD: 'resumestudio_secret',
    });
    expect(options.password).toBe('right');
    expect(warnings.join(' ')).toMatch(/DATABASE_PASSWORD is ignored/);
  });

  it('keeps verifying Supabase whatever sslmode the URL carries, unless told otherwise', () => {
    // The old template's ?sslmode=require made node-postgres reject Supabase's private CA.
    expect(tls({ DATABASE_URL: `${SESSION_POOLER_URL}?sslmode=require`, DATABASE_PASSWORD: 'x' })).toMatchObject({
      rejectUnauthorized: true,
    });
    expect(tls({ DATABASE_URL: SESSION_POOLER_URL, DATABASE_PASSWORD: 'x', DATABASE_SSL: 'no-verify' })).toEqual({
      rejectUnauthorized: false,
    });
    expect(tls({ DATABASE_URL: SESSION_POOLER_URL, DATABASE_PASSWORD: 'x', DATABASE_SSL: 'false' })).toBe(false);
  });

  it('fixes or rejects a pooler user without the project ref', () => {
    const url = `postgresql://postgres:secret@${POOLER}:6543/postgres`;
    const fixed = resolve({ DATABASE_URL: url, SUPABASE_URL: `https://${REF}.supabase.co` });
    expect(fixed.problems).toEqual([]);
    expect(fixed.options.username).toBe(`postgres.${REF}`);
    expect(fixed.target.kind).toBe('supabase-transaction-pooler');
    expect(resolve({ DATABASE_URL: url }).problems.join(' ')).toMatch(/postgres\.<project-ref>/);
  });

  it('ignores the unfilled template URL and derives the pooler from SUPABASE_URL', () => {
    const { options, target, problems, warnings } = resolve({
      DATABASE_URL: 'postgresql://postgres:[YOUR-PASSWORD]@aws-0-[YOUR-REGION].pooler.supabase.com:6543/postgres?sslmode=require',
      SUPABASE_URL: `https://${REF}.supabase.co`,
      DATABASE_HOST: 'localhost',
      DATABASE_PASSWORD: 'secret',
    });
    expect(problems).toEqual([]);
    expect(warnings.join(' ')).toMatch(/placeholder host/);
    expect(options).toMatchObject({ host: POOLER, port: 5432, username: `postgres.${REF}`, database: 'postgres', password: 'secret' });
    expect(target.source).toBe('SUPABASE_URL');
  });

  it('rejects the docker-compose password for a Supabase database', () => {
    const { problems } = resolve({ SUPABASE_URL: `https://${REF}.supabase.co`, DATABASE_PASSWORD: 'resumestudio_secret' });
    expect(problems.join(' ')).toMatch(/docker-compose password/);
  });

  it('falls back to the local docker-compose database without SSL', () => {
    const { options, target, problems } = resolve({});
    expect(problems).toEqual([]);
    expect(options).toMatchObject({
      host: 'localhost',
      port: 5432,
      username: 'resumestudio',
      password: 'resumestudio_secret',
      database: 'resumestudio',
      ssl: false,
    });
    expect(target.kind).toBe('local');
    expect(tls({ DATABASE_HOST: 'postgres' })).toBe(false); // docker-compose service name
  });

  it('encrypts other providers like sslmode=require and verifies them only on request', () => {
    const url = 'postgresql://app:secret@db.example.com:5432/app';
    expect(tls({ DATABASE_URL: url })).toEqual({ rejectUnauthorized: false });
    const verified = tls({ DATABASE_URL: `${url}?sslmode=verify-full` });
    expect(verified && verified.rejectUnauthorized).toBe(true);
    expect(verified && (verified.ca as string[]).includes(SUPABASE_ROOT_CA_2021)).toBe(false);
  });

  it('reports a malformed DATABASE_URL instead of guessing', () => {
    expect(resolve({ DATABASE_URL: 'mysql://root@localhost/db' }).problems.join(' ')).toMatch(/not a valid/);
    expect(resolve({ DATABASE_URL: 'postgresql://u:p@host:99999/db' }).problems.join(' ')).toMatch(/invalid port/);
  });

  it('keeps the schema in migrations, not in synchronize', () => {
    expect(resolve({}).options).toMatchObject({ synchronize: false, migrationsRun: false, migrationsTableName: MIGRATIONS_TABLE });
    expect(resolve({ DB_SYNC: 'true' }).options.synchronize).toBe(true);
  });
});

describe('describeDatabaseError', () => {
  const pooler = resolve({ DATABASE_URL: SESSION_POOLER_URL, DATABASE_PASSWORD: 'x' }).target;
  const direct = resolve({ DATABASE_URL: `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres` }).target;
  const error = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});

  it('separates settings to fix from failures worth a quick retry', () => {
    const cases: [Error, typeof pooler, string, boolean][] = [
      [error('password authentication failed for user "postgres"', '28P01'), pooler, 'password', false],
      [error('Tenant or user not found', 'XX000'), pooler, 'tenant', false],
      [error(`getaddrinfo ENOTFOUND db.${REF}.supabase.co`, 'ENOTFOUND'), direct, 'dns', false],
      [error('connect ENETUNREACH 2406:da18::1:5432', 'ENETUNREACH'), direct, 'ipv6', false],
      [error('self-signed certificate in certificate chain', 'SELF_SIGNED_CERT_IN_CHAIN'), pooler, 'tls', false],
      [error('(EMAXCONNSESSION) max clients reached in session mode', 'XX000'), pooler, 'connections', true],
      [error('Connection terminated due to connection timeout'), pooler, 'timeout', true],
      [error('connect ECONNREFUSED 127.0.0.1:5432', 'ECONNREFUSED'), pooler, 'refused', true],
    ];
    for (const [err, target, kind, transient] of cases) {
      expect(describeDatabaseError(err, target)).toMatchObject({ kind, transient, message: err.message });
    }
    expect(describeDatabaseError(cases[2][0], direct).hint).toMatch(/Session pooler/);
  });
});

describe('migrations', () => {
  it('create a table for every entity and lock the Data API out of all of them', async () => {
    const sql: string[] = [];
    const runner = {
      query: (statement: string) => {
        sql.push(statement);
        return Promise.resolve();
      },
      dataSource: { options: { migrationsTableName: MIGRATIONS_TABLE } },
    } as unknown as QueryRunner;
    for (const Migration of MIGRATIONS) await new Migration().up(runner);

    const created = sql.flatMap((s) => [...s.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"/g)].map((m) => m[1]));
    const secured = sql.flatMap((s) => [...s.matchAll(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1]));
    for (const entity of ENTITIES) {
      const table = getMetadataArgsStorage().tables.find((args) => args.target === entity)?.name;
      expect(created).toContain(table);
      expect(secured).toContain(table);
    }
    expect(secured).toContain(MIGRATIONS_TABLE);
  });
});
