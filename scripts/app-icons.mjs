/**
 * App icons from the ResumeStudio mark: `npm run icons`
 *
 * Writes the PWA icons (public/icons/) and, when the Android project exists, the launcher icons
 * (legacy, round and adaptive foreground) and the pre-Android-12 splash images. Re-run it after
 * changing the mark below or public/favicon.svg.
 */
import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BLUE = '#1D4ED8';
const SPLASH_BG = '#0A0C10';
const RES = 'android/app/src/main/res';

/** The document glyph from favicon.svg, drawn in its 32×32 space (centre 16,16). */
const GLYPH = `
  <path d="M10 6h8l4 4v16H10z" fill="#fff"/>
  <path d="M18 6v4h4z" fill="#A5BFF7"/>
  <rect x="12" y="16" width="8" height="2" rx="1" fill="${BLUE}"/>
  <rect x="12" y="20" width="6" height="2" rx="1" fill="${BLUE}"/>`;

/** Glyph centred at (cx, cy) in a `box`-unit canvas, `height` units tall (the glyph is 20 units). */
const glyph = (cx, cy, height) => `<g transform="translate(${cx} ${cy}) scale(${height / 20}) translate(-16 -16)">${GLYPH}</g>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Rounded-square mark (favicon look) of size s at (x, y). */
const mark = (x, y, s) =>
  `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${(s * 7) / 32}" fill="${BLUE}"/>${glyph(x + s / 2, y + s / 2, (s * 20) / 32)}`;

function png(markup, width) {
  return new Resvg(markup, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

function write(path, buffer) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, buffer);
  console.log(`  ${path}`);
}

// ---------------------------------------------------------------- PWA
write('public/icons/icon-192.png', png(svg(32, 32, mark(0, 0, 32)), 192));
write('public/icons/icon-512.png', png(svg(32, 32, mark(0, 0, 32)), 512));
// Maskable: full-bleed background, glyph inside the 80 % safe circle.
write('public/icons/icon-maskable-512.png', png(svg(512, 512, `<rect width="512" height="512" fill="${BLUE}"/>${glyph(256, 256, 230)}`), 512));

// ---------------------------------------------------------------- Android
if (existsSync(RES)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = join(RES, `mipmap-${name}`);
    const legacy = 48 * scale;
    write(join(dir, 'ic_launcher.png'), png(svg(48, 48, mark(2, 2, 44)), legacy));
    write(
      join(dir, 'ic_launcher_round.png'),
      png(svg(48, 48, `<circle cx="24" cy="24" r="22" fill="${BLUE}"/>${glyph(24, 24, 24)}`), legacy),
    );
    // Adaptive icon foreground: 108 dp canvas, visible area is the centre 72 dp (background colour
    // comes from values/ic_launcher_background.xml).
    write(join(dir, 'ic_launcher_foreground.png'), png(svg(108, 108, glyph(54, 54, 44)), 108 * scale));
  }

  // Splash images for Android 7–11 (Android 12+ shows the launcher icon instead).
  for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const file = join(RES, dir, 'splash.png');
    if (!existsSync(file)) continue;
    const header = readFileSync(file);
    const w = header.readUInt32BE(16);
    const h = header.readUInt32BE(20);
    const s = Math.round(Math.min(w, h) * 0.2);
    write(file, png(svg(w, h, `<rect width="${w}" height="${h}" fill="${SPLASH_BG}"/>${mark((w - s) / 2, (h - s) / 2, s)}`), w));
  }
}
