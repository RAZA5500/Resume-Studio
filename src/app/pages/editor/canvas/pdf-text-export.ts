import { IText, Point, util } from 'fabric';
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';

type PdfLib = typeof import('pdf-lib');

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Characters the 14 standard PDF fonts (WinAnsi encoding) can represent. */
const WIN_ANSI = /^[ -~ -ÿ–—‘’‚“”„†‡•…‰‹›€™ŒœŠšŸŽžƒˆ˜\n]*$/;

const SANS = ['arial', 'helvetica', 'inter', 'roboto', 'open sans', 'lato', 'montserrat', 'poppins', 'source sans 3', 'nunito sans', 'ibm plex sans', 'raleway'];
const SERIF = ['times new roman', 'times', 'georgia', 'merriweather', 'lora', 'eb garamond', 'playfair display'];
const MONO = ['courier new', 'courier', 'jetbrains mono', 'monospace'];

type Family = 'Helvetica' | 'TimesRoman' | 'Courier';

function familyOf(fontFamily: string | undefined): Family | null {
  const f = (fontFamily ?? '').toLowerCase().replace(/["']/g, '').split(',')[0].trim();
  if (SANS.includes(f)) return 'Helvetica';
  if (SERIF.includes(f)) return 'TimesRoman';
  if (MONO.includes(f)) return 'Courier';
  return null;
}

/**
 * True when a Fabric text object can be written as real (selectable, ATS
 * readable) PDF text with a standard font. Decorative fonts, per-character
 * styles and effects are rasterised instead so they keep their exact look.
 */
export function canVectorize(object: unknown): object is IText {
  if (!(object instanceof IText)) return false;
  const o = object;
  const hasStyles = Object.values(o.styles ?? {}).some((line) => Object.keys(line ?? {}).length > 0);
  return (
    !!familyOf(o.fontFamily) &&
    !hasStyles &&
    !o.charSpacing &&
    !o.underline &&
    !o.linethrough &&
    !o.overline &&
    !o.backgroundColor &&
    !o.textBackgroundColor &&
    !o.stroke &&
    !o.skewX &&
    !o.skewY &&
    !o.flipX &&
    !o.flipY &&
    typeof o.fill === 'string' &&
    WIN_ANSI.test(o.text)
  );
}

export class PdfFontCache {
  private readonly fonts = new Map<string, PDFFont>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly lib: PdfLib,
  ) {}

  async forText(object: IText): Promise<PDFFont> {
    const family = familyOf(object.fontFamily) ?? 'Helvetica';
    const bold = object.fontWeight === 'bold' || Number(object.fontWeight) >= 600;
    const italic = object.fontStyle === 'italic' || object.fontStyle === 'oblique';
    return this.get(family, bold, italic);
  }

  async forFamily(fontFamily: string): Promise<PDFFont> {
    return this.get(familyOf(fontFamily) ?? 'Helvetica', false, false);
  }

  private async get(family: Family, bold: boolean, italic: boolean): Promise<PDFFont> {
    const names: Record<Family, [string, string, string, string]> = {
      Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
      TimesRoman: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
      Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
    };
    const [regular, boldName, italicName, both] = names[family];
    const name = bold && italic ? both : bold ? boldName : italic ? italicName : regular;
    let font = this.fonts.get(name);
    if (!font) {
      font = await this.doc.embedFont(this.lib.StandardFonts[name as keyof typeof this.lib.StandardFonts]);
      this.fonts.set(name, font);
    }
    return font;
  }
}

function parseColor(value: unknown): { r: number; g: number; b: number } {
  const text = typeof value === 'string' ? value.trim() : '#000000';
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    const n = parseInt(full, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(text);
  if (rgb) return { r: Number(rgb[1]) / 255, g: Number(rgb[2]) / 255, b: Number(rgb[3]) / 255 };
  return { r: 0, g: 0, b: 0 };
}

/** Draws a Fabric text object as real PDF text at the same place, size and angle. */
export async function drawFabricText(
  lib: PdfLib,
  page: PDFPage,
  fonts: PdfFontCache,
  object: IText,
  scene: { width: number; height: number },
  box: PageBox,
): Promise<void> {
  const font = await fonts.forText(object);
  const sx = box.width / scene.width;
  const sy = box.height / scene.height;
  const matrix = object.calcTransformMatrix();
  const { r, g, b } = parseColor(object.fill);
  const size = object.fontSize * (object.scaleY ?? 1) * sy;
  let lineTop = -object.height / 2;

  object.textLines.forEach((line, index) => {
    const heightOfLine = object.getHeightOfLine(index);
    const baseline = lineTop + (heightOfLine / object.lineHeight) * (1 - object._fontSizeFraction);
    const left = -object.width / 2 + object._getLineLeftOffset(index);
    const point = util.transformPoint(new Point(left, baseline), matrix);
    if (line.trim()) {
      page.drawText(line, {
        x: box.x + point.x * sx,
        y: box.y + box.height - point.y * sy,
        size,
        font,
        color: lib.rgb(r, g, b),
        opacity: object.opacity ?? 1,
        rotate: lib.degrees(-(object.angle ?? 0)),
      });
    }
    lineTop += heightOfLine;
  });
}

/**
 * Adds an invisible (but selectable / searchable) text run — used to keep the
 * original words of a rasterised PDF page readable for copy-paste and ATS.
 */
export function drawInvisibleText(
  lib: PdfLib,
  page: PDFPage,
  font: PDFFont,
  item: { str: string; x: number; baseline: number; width: number; height: number },
  scene: { width: number; height: number },
  box: PageBox,
): void {
  const sx = box.width / scene.width;
  const sy = box.height / scene.height;
  const text = [...item.str].map((c) => (WIN_ANSI.test(c) ? c : '?')).join('');
  const size = Math.max(1, item.height * sy);
  const natural = font.widthOfTextAtSize(text, size);
  const squeeze = natural > 0 ? Math.max(10, Math.min(400, ((item.width * sx) / natural) * 100)) : 100;
  page.pushOperators(
    lib.pushGraphicsState(),
    lib.setTextRenderingMode(lib.TextRenderingMode.Invisible),
    lib.setCharacterSqueeze(squeeze),
  );
  page.drawText(text, { x: box.x + item.x * sx, y: box.y + box.height - item.baseline * sy, size, font });
  page.pushOperators(lib.popGraphicsState());
}
