import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import HTMLtoDOCX from '@turbodocx/html-to-docx';

export interface DocxOptions {
  title?: string;
  pageSize?: 'A4' | 'Letter';
  font?: string;
  /** Margin in twips (1 inch = 1440). */
  margin?: number;
}

const PAGE_SIZES = {
  A4: { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
};

/**
 * The converter downloads images referenced by URL. User supplied HTML must not
 * make the server fetch arbitrary (possibly internal) addresses, so only inline
 * data: images are kept.
 */
export function stripRemoteImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = (src?.[1] ?? src?.[2] ?? src?.[3] ?? '').trim();
    return /^data:image\//i.test(value) ? tag : '';
  });
}

@Injectable()
export class DocxService {
  private readonly logger = new Logger(DocxService.name);

  async fromHtml(html: string, options: DocxOptions = {}): Promise<Buffer> {
    const margin = options.margin ?? 1080;
    try {
      const result = await HTMLtoDOCX(stripRemoteImages(html), null, {
        title: options.title ?? 'Document',
        creator: 'ResumeStudio AI',
        pageSize: PAGE_SIZES[options.pageSize ?? 'A4'],
        margins: { top: margin, right: margin, bottom: margin, left: margin, header: 720, footer: 720, gutter: 0 },
        font: options.font ?? 'Calibri',
        fontSize: 22,
        decodeUnicode: true,
        table: { row: { cantSplit: true } },
      });
      if (Buffer.isBuffer(result)) return result;
      if (result instanceof ArrayBuffer) return Buffer.from(result);
      return Buffer.from(await (result as Blob).arrayBuffer());
    } catch (error) {
      this.logger.error(`DOCX conversion failed: ${String(error)}`);
      throw new InternalServerErrorException('Could not generate the Word document.');
    }
  }
}
