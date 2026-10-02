import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DataSource, MigrationExecutor } from 'typeorm';
import { DATABASE_CONFIG, type DatabaseConfig, describeTarget } from './database.config.js';
import { type DatabaseIssue, describeDatabaseError } from './database.errors.js';

export type DatabaseState = 'connecting' | 'migrating' | 'ready' | 'retrying' | 'misconfigured';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;
/** Wrong password, unknown user…: retry rarely — the pooler blocks hosts that keep failing to log in. */
const RETRY_CONFIG_MS = 5 * 60_000;

/**
 * Connects to PostgreSQL in the background, so the web server starts (and /api/health answers)
 * even while the database is unreachable. Keeps retrying with backoff, then applies pending
 * migrations under an advisory lock and makes sure no app table is open to Supabase's Data API.
 */
@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Database');
  private state: DatabaseState = 'connecting';
  private issue: DatabaseIssue | null = null;
  private attempt = 0;
  private stopped = false;
  private wake?: () => void;
  private markReady!: () => void;
  private readonly ready = new Promise<void>((resolve) => (this.markReady = resolve));

  constructor(
    private readonly dataSource: DataSource,
    @Inject(DATABASE_CONFIG) private readonly config: DatabaseConfig,
  ) {}

  get isReady(): boolean {
    return this.state === 'ready';
  }

  /** Resolves once the database is connected and migrated. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  status(): { state: DatabaseState; error?: string; hint?: string } {
    return this.issue ? { state: this.state, error: this.issue.message, hint: this.issue.hint } : { state: this.state };
  }

  onApplicationBootstrap(): void {
    const { target, problems, warnings } = this.config;
    this.logger.log(`Using ${describeTarget(target)}`);
    for (const warning of warnings) this.logger.warn(warning);

    if (problems.length) {
      this.state = 'misconfigured';
      this.issue = { kind: 'config', message: problems.join(' '), hint: 'Fix the database settings and restart.', transient: false };
      for (const problem of problems) this.logger.error(problem);
      this.logger.error('Not connecting to the database until these settings are fixed.');
      return;
    }
    void this.connectLoop();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    this.wake?.();
  }

  private async connectLoop(): Promise<void> {
    let previous = '';
    while (!this.stopped) {
      this.attempt++;
      try {
        if (!this.dataSource.isInitialized) {
          this.state = 'connecting';
          await this.dataSource.initialize();
          this.logger.log(`Connected (${await this.serverVersion()}).`);
        }
        this.state = 'migrating';
        await this.runMigrations();
        await this.closeDataApiAccess();
        this.state = 'ready';
        this.issue = null;
        this.markReady();
        this.logger.log('Database ready.');
        return;
      } catch (error) {
        if (this.stopped) return;
        this.state = 'retrying';
        this.issue = describeDatabaseError(error, this.config.target);
        const delay = this.issue.transient ? Math.min(RETRY_MIN_MS * 2 ** Math.min(this.attempt - 1, 10), RETRY_MAX_MS) : RETRY_CONFIG_MS;
        const retry = `retrying in ${Math.round(delay / 1000)}s`;
        if (this.issue.message !== previous) {
          this.logger.error(`Attempt ${this.attempt} failed (${retry}): ${this.issue.message}`);
          this.logger.error(`Fix: ${this.issue.hint}`);
          previous = this.issue.message;
        } else if (this.attempt % 10 === 0) {
          this.logger.warn(`Still failing after ${this.attempt} attempts (${this.issue.kind}), ${retry}.`);
        }
        await this.sleep(delay);
      }
    }
  }

  /**
   * Applies pending migrations in one transaction that holds an advisory lock, so two app processes
   * starting together never run the same migration twice. Works through Supabase's transaction pooler too.
   */
  private async runMigrations(): Promise<void> {
    const runner = this.dataSource.createQueryRunner('master');
    try {
      await runner.connect();
      await runner.startTransaction();
      await runner.query(`SELECT pg_advisory_xact_lock(hashtext('resumestudio:migrations'))`);
      const executor = new MigrationExecutor(this.dataSource, runner);
      executor.transaction = 'all';
      const applied = await executor.executePendingMigrations();
      await runner.commitTransaction();
      if (applied.length) this.logger.log(`Applied migrations: ${applied.map((m) => m.name).join(', ')}`);
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      await runner.release();
    }
  }

  /**
   * Supabase serves every table in "public" through its Data API to anyone with the anon key. Row level
   * security without policies closes that, while the backend — the tables' owner — is not affected.
   * Migrations enable it; this catches tables created later without it (e.g. by DB_SYNC=true).
   */
  private async closeDataApiAccess(): Promise<void> {
    const tables = [
      ...this.dataSource.entityMetadatas.map((meta) => meta.tableName),
      this.config.options.migrationsTableName ?? 'migrations',
    ];
    const open: { name: string }[] = await this.dataSource.query(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = current_schema() AND c.relkind = 'r' AND NOT c.relrowsecurity AND c.relname = ANY($1)`,
      [tables],
    );
    for (const { name } of open) {
      try {
        await this.dataSource.query(`ALTER TABLE "${name.replace(/"/g, '""')}" ENABLE ROW LEVEL SECURITY`);
        this.logger.warn(`Enabled row level security on "${name}" (it was open to the Data API).`);
      } catch (error) {
        this.logger.warn(`Could not enable row level security on "${name}": ${(error as Error).message}`);
      }
    }
  }

  private async serverVersion(): Promise<string> {
    try {
      const [row] = await this.dataSource.query<{ version: string }[]>(`SELECT current_setting('server_version') AS version`);
      return `PostgreSQL ${row?.version ?? '?'}`;
    } catch {
      return 'PostgreSQL';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      timer.unref();
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
  }
}
