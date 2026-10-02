/** Google Fonts families available in the resume designer with the weights they ship. */
export const FONT_WEIGHTS: Record<string, string> = {
  Inter: '300;400;500;600;700;800',
  Roboto: '300;400;500;700',
  Lato: '300;400;700',
  'Open Sans': '400;600;700',
  Montserrat: '400;500;600;700',
  'Source Sans 3': '400;600;700',
  Poppins: '400;500;600;700',
  Raleway: '400;600;700',
  'Nunito Sans': '400;600;700',
  'IBM Plex Sans': '400;500;600;700',
  Merriweather: '400;700',
  'Playfair Display': '400;600;700',
  Lora: '400;600;700',
  'EB Garamond': '400;600;700',
  'JetBrains Mono': '400;500;700',
};

export const SERIF_FONTS = new Set(['Merriweather', 'Playfair Display', 'Lora', 'EB Garamond']);

export const FONT_OPTIONS = Object.keys(FONT_WEIGHTS).filter((f) => f !== 'JetBrains Mono');

export function fontStack(family: string): string {
  if (family === 'JetBrains Mono') return `'JetBrains Mono', monospace`;
  return SERIF_FONTS.has(family) ? `'${family}', Georgia, serif` : `'${family}', Arial, sans-serif`;
}

/** Script faces offered for typed signatures and canvas text (not resume fonts). */
const SCRIPT_FONT_WEIGHTS: Record<string, string> = {
  'Great Vibes': '400',
  'Dancing Script': '400;700',
};

const ALL_WEIGHTS: Record<string, string> = { ...FONT_WEIGHTS, ...SCRIPT_FONT_WEIGHTS };

export function googleFontsUrl(families: string[]): string {
  const unique = [...new Set(families.filter((f) => ALL_WEIGHTS[f]))];
  const params = unique
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${ALL_WEIGHTS[f]}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

const requested = new Set<string>();

/**
 * Adds the Google Fonts stylesheet for families that are not loaded yet. Template fonts are not
 * part of the page start-up any more: each preview, editor or picker asks for the families it
 * shows, and the browser downloads only the glyph files that text actually uses.
 */
export function loadFonts(families: Iterable<string>): void {
  if (typeof document === 'undefined') return;
  const missing = [...new Set(families)].filter((family) => ALL_WEIGHTS[family] && !requested.has(family));
  if (!missing.length) return;
  missing.forEach((family) => requested.add(family));
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = googleFontsUrl(missing);
  document.head.appendChild(link);
}
