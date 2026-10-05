import { createHash } from 'node:crypto';
import { inlineScriptHashes } from './csp.js';

const sha = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

describe('inlineScriptHashes', () => {
  it('hashes the exact text of each inline script and skips external and empty ones', () => {
    const theme = "\n    (function () { document.documentElement.setAttribute('data-theme', 'dark'); })();\n  ";
    const html = `<head><script>${theme}</script><script src="main-ABC.js" type="module"></script><script type="module" src="x.js"></script><script> </script></head>`;
    expect(inlineScriptHashes(html)).toEqual([sha(theme)]);
  });

  it('returns nothing for a page without inline scripts', () => {
    expect(inlineScriptHashes('<html><body><script src="a.js"></script></body></html>')).toEqual([]);
  });
});
