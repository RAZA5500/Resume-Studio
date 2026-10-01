import { stripRemoteImages } from './docx.service.js';

describe('stripRemoteImages', () => {
  it('keeps inline data images', () => {
    const html = '<p>Logo <img alt="x" src="data:image/png;base64,AAAA"></p>';
    expect(stripRemoteImages(html)).toBe(html);
  });

  it('removes images that would be fetched from the network', () => {
    const html =
      '<img src="http://169.254.169.254/latest/meta-data"><img src=\'https://example.com/a.png\'><img src=//evil/x.png><p>ok</p>';
    expect(stripRemoteImages(html)).toBe('<p>ok</p>');
  });

  it('removes images without a source', () => {
    expect(stripRemoteImages('<img alt="empty"><b>text</b>')).toBe('<b>text</b>');
  });
});
