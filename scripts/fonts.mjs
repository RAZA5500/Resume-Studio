/**
 * Self-hosts the interface fonts: `npm run fonts`
 *
 * Downloads Plus Jakarta Sans, Bricolage Grotesque, Instrument Serif and a Material Symbols
 * subset holding only the icons the app uses into public/fonts/, then writes src/_fonts.scss
 * (the @font-face rules) and the <link rel="preload"> tags in src/index.html.
 *
 * Run it again after using an icon that is not in scripts/icons.json — the build prints a
 * warning when that happens. Resume template fonts are not self-hosted; they load on demand
 * from Google Fonts (see src/app/core/utils/fonts.ts).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_DIR = 'public/fonts';
const SCSS_FILE = 'src/_fonts.scss';
const ICON_LIST = 'scripts/icons.json';
const INDEX_HTML = 'src/index.html';
const SUBSETS = new Set(['latin', 'latin-ext']);

const TEXT_FONTS = [
  { slug: 'plus-jakarta-sans', query: 'Plus+Jakarta+Sans:wght@400..800', preload: true },
  { slug: 'bricolage-grotesque', query: 'Bricolage+Grotesque:opsz,wght@12..96,500..800' },
  { slug: 'instrument-serif', query: 'Instrument+Serif:ital@0;1' },
];
const ICON_QUERY = 'Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0..1,0';

async function get(url, type = 'text') {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return type === 'text' ? response.text() : Buffer.from(await response.arrayBuffer());
}

/** @font-face blocks of a Google Fonts stylesheet, with the subset named in the comment above each. */
function parseFaces(css) {
  const faces = [];
  for (const match of css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*{([^}]*)}/g)) {
    const body = match[2];
    const prop = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1].trim();
    faces.push({
      subset: match[1] ?? null,
      family: prop('font-family')?.replace(/['"]/g, ''),
      style: prop('font-style') ?? 'normal',
      weight: prop('font-weight') ?? '400',
      unicodeRange: prop('unicode-range'),
      url: /url\(([^)]+)\)/.exec(body)?.[1],
    });
  }
  return faces;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (['.ts', '.html'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

/**
 * Icons used in the source. `direct`: the text of class="i" elements — always kept. `quoted`: every
 * quoted snake_case string (icons picked in TypeScript, ternaries in templates); these are kept
 * only when Google lists them as an icon name, so ordinary strings do not bloat the request.
 */
function iconCandidates() {
  const direct = new Set();
  const quoted = new Set();
  for (const file of walk('src/app')) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/class="i(?:\s[^"]*)?"[^>]*>\s*([a-z0-9_]+)\s*</g)) direct.add(m[1]);
    for (const m of source.matchAll(/(['"`])([a-z0-9][a-z0-9_]{1,48})\1/g)) quoted.add(m[2]);
  }
  return { direct, quoted };
}

/**
 * Every icon name Google knows, in any Material family. Older names (auto_awesome, expand_more…)
 * are listed as Material Icons only, yet the Symbols font still accepts them as ligatures, and the
 * subset API simply skips names it cannot draw — so filtering by family would drop working icons.
 */
async function materialSymbolNames() {
  const raw = await get('https://fonts.google.com/metadata/icons?key=material_symbols&incomplete=true');
  const data = JSON.parse(raw.replace(/^\)\]\}'/, ''));
  return new Set(data.icons.map((icon) => icon.name));
}

function hashed(slug, buffer) {
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 8).toUpperCase();
  return `${slug}-${hash}.woff2`;
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const rules = [];
  const preload = [];

  for (const font of TEXT_FONTS) {
    const css = await get(`https://fonts.googleapis.com/css2?family=${font.query}&display=swap`);
    for (const face of parseFaces(css).filter((f) => SUBSETS.has(f.subset))) {
      const buffer = await get(face.url, 'binary');
      const file = hashed(`${font.slug}-${face.style === 'italic' ? 'italic-' : ''}${face.subset}`, buffer);
      writeFileSync(join(OUT_DIR, file), buffer);
      rules.push(
        `/* ${face.subset} */\n@font-face {\n  font-family: '${face.family}';\n  font-style: ${face.style};\n` +
          `  font-weight: ${face.weight};\n  font-display: swap;\n  src: url('/fonts/${file}') format('woff2');\n` +
          `  unicode-range: ${face.unicodeRange};\n}`,
      );
      if (font.preload && face.subset === 'latin' && face.style === 'normal') preload.push(file);
      console.log(`  ${file}  ${(buffer.length / 1024).toFixed(1)} kB`);
    }
  }

  // The metadata lags behind the font (newer icons such as magic_button are missing from it).
  const known = await materialSymbolNames();
  const { direct, quoted } = iconCandidates();
  const icons = [...new Set([...direct, ...[...quoted].filter((word) => known.has(word))])].sort();
  const iconCss = await get(
    `https://fonts.googleapis.com/css2?family=${ICON_QUERY}&icon_names=${icons.join(',')}&display=block`,
  );
  const iconFace = parseFaces(iconCss)[0];
  const iconBuffer = await get(iconFace.url, 'binary');
  const iconFile = hashed('material-symbols', iconBuffer);
  writeFileSync(join(OUT_DIR, iconFile), iconBuffer);
  preload.push(iconFile);
  rules.push(
    `@font-face {\n  font-family: 'Material Symbols Outlined';\n  font-style: normal;\n  font-weight: ${iconFace.weight};\n` +
      `  font-display: block;\n  src: url('/fonts/${iconFile}') format('woff2');\n}`,
  );
  console.log(`  ${iconFile}  ${(iconBuffer.length / 1024).toFixed(1)} kB  (${icons.length} icons)`);

  writeFileSync(
    SCSS_FILE,
    `// Generated by scripts/fonts.mjs (npm run fonts) — do not edit by hand.\n\n${rules.join('\n\n')}\n`,
  );
  writeFileSync(ICON_LIST, `${JSON.stringify(icons, null, 0).replace(/","/g, '",\n"')}\n`);

  const tags = preload
    .map((file) => `  <link rel="preload" href="/fonts/${file}" as="font" type="font/woff2" crossorigin>`)
    .join('\n');
  const html = readFileSync(INDEX_HTML, 'utf8');
  const block = /( *)<!-- fonts:preload -->[\s\S]*?<!-- \/fonts:preload -->/;
  if (!block.test(html)) throw new Error(`${INDEX_HTML} needs <!-- fonts:preload --><!-- /fonts:preload --> markers`);
  writeFileSync(INDEX_HTML, html.replace(block, `$1<!-- fonts:preload -->\n${tags}\n$1<!-- /fonts:preload -->`));
  console.log(`\nWrote ${SCSS_FILE}, ${ICON_LIST} and the preload tags in ${INDEX_HTML}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
