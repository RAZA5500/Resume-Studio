import type { DatabaseTarget } from './database.config.js';

export interface DatabaseIssue {
  kind:
    | 'config'
    | 'password'
    | 'tenant'
    | 'blocked'
    | 'paused'
    | 'dns'
    | 'ipv6'
    | 'refused'
    | 'timeout'
    | 'tls'
    | 'connections'
    | 'missing-database'
    | 'unknown';
  /** The driver's message (never contains the password). */
  message: string;
  /** What to do about it. */
  hint: string;
  /** True when retrying soon can help; false when someone has to change a setting first. */
  transient: boolean;
}

const SESSION_POOLER = 'Use the "Session pooler" connection string from Supabase → Connect (host *.pooler.supabase.com, port 5432).';

/** Explains a failed connection or migration in terms of what to change. */
export function describeDatabaseError(error: unknown, target: DatabaseTarget): DatabaseIssue {
  const err = error as { message?: unknown; code?: unknown } | undefined;
  const message = (typeof err?.message === 'string' && err.message) || String(error);
  const code = typeof err?.code === 'string' ? err.code : '';
  const supabase = target.kind.startsWith('supabase');
  const issue = (kind: DatabaseIssue['kind'], hint: string, transient = false): DatabaseIssue => ({
    kind,
    message,
    hint,
    transient,
  });

  if (code === '28P01' || /password authentication failed/i.test(message)) {
    return issue(
      'password',
      supabase
        ? `Wrong database password (taken from ${target.passwordSource}). Supabase → Project Settings → Database → ` +
            '"Reset database password", then put the new password in DATABASE_PASSWORD and restart.'
        : `Wrong database password (taken from ${target.passwordSource}).`,
    );
  }
  if (/tenant or user not found|ENOIDENTIFIER|no tenant identifier/i.test(message)) {
    return issue(
      'tenant',
      `The pooler does not know the user "${target.user}". It must be "postgres.<project-ref>" and the host must ` +
        `belong to the project's region. ${SESSION_POOLER} If the project is paused, restore it in the Supabase dashboard.`,
    );
  }
  if (/circuit.?breaker|too many authentication|temporarily (blocked|banned)|banned/i.test(message)) {
    return issue(
      'blocked',
      'Supabase blocked this server for a while after repeated failed logins. Fix DATABASE_PASSWORD; ' +
        'the block lifts by itself after a few minutes.',
    );
  }
  if (/paused|is being restored|project.*(inactive|suspended)/i.test(message)) {
    return issue('paused', 'The Supabase project is paused. Restore it in the Supabase dashboard (free projects pause after a week without activity).');
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo/i.test(message)) {
    return issue(
      'dns',
      target.kind === 'supabase-direct'
        ? `${target.host} only has an IPv6 address, which this server cannot use. ${SESSION_POOLER}`
        : `The host name "${target.host}" does not resolve. Check DATABASE_URL / DATABASE_HOST.`,
      code === 'EAI_AGAIN',
    );
  }
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'EADDRNOTAVAIL') {
    return issue(
      'ipv6',
      target.kind === 'supabase-direct'
        ? `This server has no IPv6 route to ${target.host}. ${SESSION_POOLER}`
        : `No network route to ${target.host}:${target.port}.`,
      target.kind !== 'supabase-direct',
    );
  }
  if (code === 'ECONNREFUSED') {
    return issue(
      'refused',
      target.kind === 'local'
        ? `Nothing is listening on ${target.host}:${target.port}. Start the local database (docker compose up -d) ` +
            'or set DATABASE_URL to your Supabase connection string.'
        : `${target.host}:${target.port} refused the connection. Check the host and port.`,
      true,
    );
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || /timeout|timed out|Connection terminated unexpectedly/i.test(message)) {
    return issue(
      'timeout',
      `No answer from ${target.host}:${target.port}. Outgoing connections to port ${target.port} may be blocked by the ` +
        'hosting firewall, or the database is restarting.',
      true,
    );
  }
  if (/certificate|self[- ]signed|CERT_|SSL|TLS/i.test(code + ' ' + message)) {
    return issue(
      'tls',
      /does not support SSL/i.test(message)
        ? 'The server does not accept SSL. Set DATABASE_SSL=false (only for a database on a private network).'
        : 'The SSL certificate could not be verified. Point DATABASE_SSL_CA at the provider\'s CA certificate, ' +
            'or set DATABASE_SSL=no-verify to encrypt without verifying.',
    );
  }
  if (code === '53300' || /max client connections|EMAXCONN|too many (clients|connections)|remaining connection slots/i.test(message)) {
    return issue(
      'connections',
      'The database has no free connections. Lower DATABASE_MAX_CONNECTIONS (the Supabase free plan allows 15 in total) ' +
        'or close other clients.',
      true,
    );
  }
  if (code === '3D000') {
    return issue('missing-database', `The database "${target.database}" does not exist. Supabase databases are called "postgres".`);
  }
  return issue('unknown', 'Unexpected database error; the message and the server log have the details.', true);
}
