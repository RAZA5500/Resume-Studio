import { DataSource } from 'typeorm';
import { describeTarget, resolveDatabaseConfig } from './database.config.js';

/**
 * Entry point for the TypeORM CLI (npm run migration:run / :show / :revert / :generate).
 * Uses the same settings as the app: backend/.env plus the environment.
 */
try {
  process.loadEnvFile();
} catch {
  // no .env file — the environment alone configures the database
}

const { options, target, problems } = resolveDatabaseConfig((key) => process.env[key]);
if (problems.length) throw new Error(`Database settings: ${problems.join(' ')}`);
console.log(`Database: ${describeTarget(target)}`);

export default new DataSource(options);
