/**
 * Production build: `npm run build`
 *
 * Bakes the backend address into the app when the API runs on another domain:
 *   API_URL=https://api.example.com npm run build        (bash)
 *   $env:API_URL="https://api.example.com"; npm run build (PowerShell)
 * On Hostinger web hosting, add API_URL under the website's environment variables instead.
 *
 * Without API_URL the app calls /api on its own domain (dev proxy, and `npm start`, which serves both).
 * Extra arguments are passed to `ng build`, e.g. `npm run build -- --configuration development`.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

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
if (result.status === 0) warnAboutMissingIcons();
process.exit(result.status ?? 1);

/**
 * The icon font only contains the icons listed in scripts/icons.json (npm run fonts). An icon
 * added later would show as its name in plain text, so point it out here.
 */
function warnAboutMissingIcons() {
  const subset = new Set(JSON.parse(readFileSync('scripts/icons.json', 'utf8')));
  const missing = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (['.ts', '.html'].includes(extname(entry.name))) {
        const source = readFileSync(path, 'utf8');
        for (const m of source.matchAll(/class="i(?:\s[^"]*)?"[^>]*>\s*([a-z0-9_]+)\s*</g)) {
          if (!subset.has(m[1])) missing.add(m[1]);
        }
      }
    }
  };
  walk('src/app');
  if (missing.size) {
    console.warn(`\n⚠ Icons not in the icon font: ${[...missing].join(', ')} — run "npm run fonts" to add them.\n`);
  }
}
