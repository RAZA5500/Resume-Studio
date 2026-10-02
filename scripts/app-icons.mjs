/**
 * Brand mark and every icon made from it: `npm run icons`
 *
 * The mark is an "R" on a page with a folded corner. This script is its single source: it writes
 * public/favicon.svg, public/favicon.ico, public/apple-touch-icon.png, the PWA icons (public/icons/)
 * and — when the Android project exists — the launcher icons and splash images as WebP.
 * The same SVG is inlined in src/app/shared/ui/logo.ts and the boot screen in src/index.html.
 *
 * Formats: the favicon and in-page logo stay vector (smaller and sharper than any bitmap). Bitmaps
 * are WebP wherever the platform accepts it (Android resources); favicon.ico, apple-touch-icon and
 * the install icons in the web manifest stay PNG/ICO because browsers and iOS require those.
 */
import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BRAND = '#2563EB';
const FOLD = '#BFD4FF';
const SPLASH_BG = '#0A0C10';
const RES = 'android/app/src/main/res';

// ---------------------------------------------------------------- the mark (32 × 32 units)
const PAGE = 'M6.5 0H22.5L32 9.5V25.5A6.5 6.5 0 0 1 25.5 32H6.5A6.5 6.5 0 0 1 0 25.5V6.5A6.5 6.5 0 0 1 6.5 0Z';
const FOLD_FLAP = 'M22.5 0V7.5A2 2 0 0 0 24.5 9.5H32Z';
const R_PATH = 'M10.5 24.5V8.5H16.2A4.4 4.4 0 0 1 16.2 17.3H10.5M15.8 17.3L21.3 24.5';
const R_STROKE = 3.3;
/** Visual centre and height of the R (stroke included), for centring it on full-bleed tiles. */
const R_CENTER = [15.9, 16.5];
const R_HEIGHT = 19.3;

const r = (color = '#fff') =>
  `<path d="${R_PATH}" fill="none" stroke="${color}" stroke-width="${R_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The full mark: blue page, folded corner, white R. */
export const MARK = `<path d="${PAGE}" fill="${BRAND}"/><path d="${FOLD_FLAP}" fill="${FOLD}"/>${r()}`;

/** The R alone, centred at (cx, cy) and `height` units tall. */
const glyph = (cx, cy, height) =>
  `<g transform="translate(${cx} ${cy}) scale(${height / R_HEIGHT}) translate(${-R_CENTER[0]} ${-R_CENTER[1]})">${r()}</g>`;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** The mark placed at (x, y) with side s inside a larger drawing. */
const markAt = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s / 32})">${MARK}</g>`;

// ---------------------------------------------------------------- encoders
function render(markup, width) {
  return new Resvg(markup, { fitTo: { mode: 'width', value: width } }).render();
}

const png = (markup, width) => render(markup, width).asPng();

let webpEncoder;
async function webp(markup, width) {
  if (!webpEncoder) {
    const require = createRequire(import.meta.url);
    const entry = require.resolve('@jsquash/webp/encode.js');
    const encoder = await import(pathToFileURL(entry).href);
    const wasm = readFileSync(join(dirname(entry), 'codec/enc/webp_enc.wasm'));
    await encoder.init(await WebAssembly.compile(wasm));
    webpEncoder = encoder.default;
  }
  const image = render(markup, width);
  const data = new Uint8ClampedArray(image.pixels.buffer, image.pixels.byteOffset, image.pixels.byteLength);
  return Buffer.from(await webpEncoder({ data, width: image.width, height: image.height }, { lossless: 1 }));
}

/** .ico holding PNG images (supported by every browser since IE Vista era). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

function write(path, buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  console.log(`  ${path}  ${(buffer.length / 1024).toFixed(1)} kB`);
}

// ---------------------------------------------------------------- web
const favicon = svg(32, 32, MARK).replace(' width="32" height="32"', '');
write('public/favicon.svg', Buffer.from(`${favicon}\n`));
write('public/favicon.ico', ico([16, 32, 48].map((size) => ({ size, data: png(svg(32, 32, MARK), size) }))));
// iOS masks the corners itself and needs an opaque PNG.
write('public/apple-touch-icon.png', png(svg(180, 180, `<rect width="180" height="180" fill="${BRAND}"/>${glyph(90, 90, 104)}`), 180));
// Install icons for the web manifest (only fetched when the site is installed).
write('public/icons/icon-192.png', png(svg(32, 32, MARK), 192));
write('public/icons/icon-512.png', png(svg(32, 32, MARK), 512));
write('public/icons/icon-maskable-512.png', png(svg(512, 512, `<rect width="512" height="512" fill="${BRAND}"/>${glyph(256, 256, 236)}`), 512));

// ---------------------------------------------------------------- Android (WebP resources)
if (existsSync(RES)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = join(RES, `mipmap-${name}`);
    for (const old of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) rmSync(join(dir, `${old}.png`), { force: true });
    write(join(dir, 'ic_launcher.webp'), await webp(svg(48, 48, markAt(2, 2, 44)), 48 * scale));
    write(join(dir, 'ic_launcher_round.webp'), await webp(svg(48, 48, `<circle cx="24" cy="24" r="22" fill="${BRAND}"/>${glyph(24, 24, 24)}`), 48 * scale));
    // Adaptive icon foreground: 108 dp canvas, launchers show the centre 72 dp (66 dp safe circle);
    // the background colour is values/ic_launcher_background.xml.
    write(join(dir, 'ic_launcher_foreground.webp'), await webp(svg(108, 108, glyph(54, 54, 46)), 108 * scale));
  }
  writeFileSync(
    join(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`,
  );

  // Splash images for Android 7–11 (Android 12+ shows the adaptive icon on the splash colour).
  for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const source = ['splash.png', 'splash.webp'].map((f) => join(RES, dir, f)).find((f) => existsSync(f));
    if (!source) continue;
    const head = readFileSync(source);
    // Keep each density's size: from the PNG header (first run) or our own WebP (re-runs).
    const [w, h] = source.endsWith('.png') ? [head.readUInt32BE(16), head.readUInt32BE(20)] : webpSize(head);
    const s = Math.round(Math.min(w, h) * 0.2);
    rmSync(join(RES, dir, 'splash.png'), { force: true });
    write(join(RES, dir, 'splash.webp'), await webp(svg(w, h, `<rect width="${w}" height="${h}" fill="${SPLASH_BG}"/>${markAt((w - s) / 2, (h - s) / 2, s)}`), w));
  }
}

/** Width and height of a lossless (VP8L) WebP, as written by this script. */
function webpSize(buffer) {
  const bits = buffer.readUInt32LE(21);
  return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
}
