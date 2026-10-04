import { describe, expect, it } from 'vitest';
import { DocxService } from './docx.service.js';
import { WATERMARK_FOOTER, watermarkHtml, watermarkText } from './watermark.js';

describe('watermark', () => {
  it('injects the overlay before the last closing body tag', () => {
    const html = watermarkHtml('<html><body><p>Hi</p></body></html>');
    expect(html).toMatch(/<p>Hi<\/p><style>[\s\S]*class="rs-wm"[\s\S]*<\/div><\/body><\/html>$/);
  });

  it('appends the overlay to fragments without a body', () => {
    expect(watermarkHtml('<p>Hi</p>')).toMatch(/^<p>Hi<\/p><style>/);
  });

  it('adds the footer line to plain text', () => {
    expect(watermarkText('Jane Doe\n\n')).toBe(`Jane Doe\n\n---\n${WATERMARK_FOOTER}\n`);
  });

  it('puts the footer into free plan Word files only', async () => {
    const docx = new DocxService();
    // Zip entry names are stored uncompressed, so the footer part is visible in the raw bytes.
    const hasFooter = async (watermark: boolean) =>
      (await docx.fromHtml('<p>Hello</p>', { watermark })).includes('word/footer1.xml');
    expect(await hasFooter(true)).toBe(true);
    expect(await hasFooter(false)).toBe(false);
  });
});
