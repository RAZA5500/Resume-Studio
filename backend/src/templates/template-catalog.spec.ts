import { DEFAULT_TEMPLATE_ID, FONTS, generateTemplates, LAYOUTS, PALETTES, tint } from './template-catalog.js';

describe('template catalog', () => {
  const templates = generateTemplates();

  it('generates thousands of unique templates', () => {
    expect(templates.length).toBe(LAYOUTS.length * PALETTES.length * FONTS.length);
    expect(templates.length).toBeGreaterThan(4000);
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  });

  it('is deterministic between runs', () => {
    const first = templates.find((t) => t.id === DEFAULT_TEMPLATE_ID);
    expect(first).toBeDefined();
    expect(first?.config.layout).toBe('modern');
    expect(first?.config.primaryColor).toBe('#1e3a8a');
  });

  it('marks single-column layouts as ATS friendly', () => {
    for (const template of templates) {
      expect(template.atsFriendly).toBe(template.columns === 1);
    }
    expect(templates.filter((t) => t.atsFriendly).length).toBeGreaterThan(3000);
  });

  it('mixes colours with white', () => {
    expect(tint('#000000', 0)).toBe('#ffffff');
    expect(tint('#1e3a8a', 1)).toBe('#1e3a8a');
  });
});
