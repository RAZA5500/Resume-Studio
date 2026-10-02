import { DataSource, MigrationExecutor } from 'typeorm';
import { describeTarget, resolveDatabaseConfig } from './database.config.js';
import { describeDatabaseError } from './database.errors.js';

/**
 * `npm run db:check` — shows where the API would connect, tries it, and reports pending migrations
 * and tables that Supabase's Data API could still read. Changes nothing.
 */
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

const { options, target, problems, warnings } = resolveDatabaseConfig((key) => process.env[key]);
console.log(`Target   : ${describeTarget(target)}`);
for (const warning of warnings) console.log(`Warning  : ${warning}`);
if (problems.length) {
  for (const problem of problems) console.log(`Problem  : ${problem}`);
  process.exit(1);
}

const dataSource = new DataSource(options);
try {
  await dataSource.initialize();
  const [server] = await dataSource.query<{ version: string; user: string }[]>(
    `SELECT current_setting('server_version') AS version, current_user AS user`,
  );
  console.log(`Connected: PostgreSQL ${server.version} as ${server.user}`);

  const executor = new MigrationExecutor(dataSource);
  const executed = await executor.getExecutedMigrations();
  const pending = await executor.getPendingMigrations();
  const pendingNames = pending.map((m) => m.name).join(', ');
  console.log(
    `Migrations: ${executed.length} applied, ${pending.length} pending` +
      (pending.length ? ` (${pendingNames}) — the API applies them when it starts` : ''),
  );

  const tables = dataSource.entityMetadatas.map((meta) => meta.tableName);
  const rows = await dataSource.query<{ name: string; rls: boolean }[]>(
    `SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND c.relkind = 'r' AND c.relname = ANY($1)`,
    [tables],
  );
  const open = rows.filter((row) => !row.rls).map((row) => row.name);
  console.log(`Tables   : ${rows.length}/${tables.length} exist${open.length ? `; without row level security: ${open.join(', ')}` : ''}`);
  console.log('OK');
} catch (error) {
  const issue = describeDatabaseError(error, target);
  console.log(`Failed   : ${issue.message}`);
  console.log(`Fix      : ${issue.hint}`);
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
