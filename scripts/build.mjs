/**
 * Production build: `npm run build`
 *
 * Bakes the backend address into the app when the API runs on another domain:
 *   API_URL=https://api.example.com npm run build        (bash)
 *   $env:API_URL="https://api.example.com"; npm run build (PowerShell)
 * On Hostinger web hosting, add API_URL under the website's environment variables instead.
 *
 * Without API_URL the app calls /api on its own domain (dev proxy, VPS / Docker setup).
 * Extra arguments are passed to `ng build`, e.g. `npm run build -- --configuration development`.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const apiUrl = (process.env.API_URL ?? process.env.NG_APP_API_URL ?? '').trim().replace(/\/+$/, '');

if (apiUrl && !/^https?:\/\/[^\s/]+/.test(apiUrl)) {
  console.error(`\nAPI_URL must start with http:// or https:// (got "${apiUrl}").\n`);
  process.exit(1);
}

console.log(
  apiUrl
    ? `\n› API_URL = ${apiUrl}\n`
    : '\n› API_URL not set — the app will call /api on its own domain.\n',
);

const ngCli = require.resolve('@angular/cli/bin/ng.js');
const args = [ngCli, 'build', ...process.argv.slice(2), '--define', `ngApiUrl=${JSON.stringify(apiUrl)}`];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
