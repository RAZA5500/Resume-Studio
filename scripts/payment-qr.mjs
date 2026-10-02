/**
 * Payment QR for the checkout page: `npm run payment-qr` (or `npm run payment-qr -- path/to/qr.jpg`)
 *
 * Takes the merchant QR poster (default: "Qr Scanner.jpeg" in the project root) and writes
 *   public/payment/payment-qr-600.webp, payment-qr-full.webp  — shown on the billing page
 *   public/payment/payment-qr.jpg                            — the "Save QR" download
 * The download stays JPEG so every banking app's "scan from gallery" can open it.
 * After replacing the QR, also update PAYMENT_QR in src/app/pages/billing/billing-page.ts.
 */
import { Resvg } from '@resvg/resvg-js';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = process.argv[2] ?? 'Qr Scanner.jpeg';
const outDir = 'public/payment';
const jpeg = readFileSync(source);
if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error(`${source} is not a JPEG image`);

// Image size from the JPEG start-of-frame marker.
let width = 0;
let height = 0;
for (let i = 2; i < jpeg.length; ) {
  if (jpeg[i] !== 0xff) {
    i++;
    continue;
  }
  const marker = jpeg[i + 1];
  if (marker >= 0xc0 && marker <= 0xc3) {
    height = jpeg.readUInt16BE(i + 5);
    width = jpeg.readUInt16BE(i + 7);
    break;
  }
  i += 2 + jpeg.readUInt16BE(i + 2);
}

const require = createRequire(import.meta.url);
const entry = require.resolve('@jsquash/webp/encode.js');
const encoder = await import(pathToFileURL(entry).href);
await encoder.init(await WebAssembly.compile(readFileSync(join(dirname(entry), 'codec/enc/webp_enc.wasm'))));

mkdirSync(outDir, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image width="${width}" height="${height}" href="data:image/jpeg;base64,${jpeg.toString('base64')}"/></svg>`;
for (const [name, target] of [['600', 600], ['full', 1200]]) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: Math.min(target, width) } }).render();
  const data = new Uint8ClampedArray(image.pixels.buffer, image.pixels.byteOffset, image.pixels.byteLength);
  // High quality: QR modules must stay crisp enough to scan from a screen.
  const webp = Buffer.from(await encoder.default({ data, width: image.width, height: image.height }, { quality: 90 }));
  const file = join(outDir, `payment-qr-${name}.webp`);
  writeFileSync(file, webp);
  console.log(`  ${file}  ${image.width}×${image.height}  ${(webp.length / 1024).toFixed(1)} kB`);
}
copyFileSync(source, join(outDir, 'payment-qr.jpg'));
console.log(`  ${join(outDir, 'payment-qr.jpg')}  ${width}×${height}  ${(jpeg.length / 1024).toFixed(1)} kB (download)`);
