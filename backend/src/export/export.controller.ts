import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { contentDisposition, decodeOriginalName, detectFileKind, MAX_UPLOAD_BYTES, MIME_TYPES, safeFileBase } from '../common/files.js';
import { escapeHtml, textToHtml } from '../common/utils.js';
import { TextExtractionService } from '../extraction/text-extraction.service.js';
import { DocxService } from './docx.service.js';
import { ConvertDto, HtmlExportDto } from './dto/export.dto.js';
import { PdfRendererService } from './pdf-renderer.service.js';

const DOCUMENT_CSS = `
  @page { margin: 20mm; }
  body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1f2937; }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #d1d5db; padding: 4px 8px; }
`;

function wrapHtml(body: string, title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${DOCUMENT_CSS}</style></head><body>${body}</body></html>`;
}

@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('export')
export class ExportController {
  constructor(
    private readonly pdf: PdfRendererService,
    private readonly docx: DocxService,
    private readonly extraction: TextExtractionService,
  ) {}

  @Get('status')
  status() {
    return { pdfEngine: this.pdf.available };
  }

  /** Full HTML document → text-based PDF (used by the resume builder and document editor). */
  @HttpCode(200)
  @Post('pdf')
  async toPdf(@Body() dto: HtmlExportDto) {
    const buffer = await this.pdf.render(dto.html, { pageSize: dto.pageSize, landscape: dto.landscape });
    return new StreamableFile(buffer, {
      type: MIME_TYPES.pdf,
      disposition: contentDisposition(`${safeFileBase(dto.fileName ?? 'document')}.pdf`),
    });
  }

  @HttpCode(200)
  @Post('docx')
  async toDocx(@Body() dto: HtmlExportDto) {
    const title = safeFileBase(dto.fileName ?? 'document');
    const buffer = await this.docx.fromHtml(dto.html, { title, pageSize: dto.pageSize });
    return new StreamableFile(buffer, { type: MIME_TYPES.docx, disposition: contentDisposition(`${title}.docx`) });
  }

  /** Converts an uploaded file: Word → PDF, PDF/image → Word, anything → text or HTML. */
  @HttpCode(200)
  @Post('convert')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async convert(@Body() dto: ConvertDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please choose a file to convert.');
    const originalname = decodeOriginalName(file.originalname);
    const kind = detectFileKind(originalname, file.mimetype);
    const base = safeFileBase(originalname);

    let html: string;
    if (kind === 'docx') {
      html = await this.extraction.docxToHtml(file.buffer);
    } else if (kind === 'html') {
      html = file.buffer.toString('utf8');
    } else {
      const extracted = await this.extraction.extract({ buffer: file.buffer, originalname, mimetype: file.mimetype });
      if (dto.target === 'txt') {
        return new StreamableFile(Buffer.from(extracted.text, 'utf8'), {
          type: MIME_TYPES.txt,
          disposition: contentDisposition(`${base}.txt`),
        });
      }
      html = textToHtml(extracted.text);
    }

    switch (dto.target) {
      case 'pdf': {
        if (kind === 'pdf') throw new BadRequestException('This file is already a PDF.');
        const buffer = await this.pdf.render(/<html/i.test(html) ? html : wrapHtml(html, base));
        return new StreamableFile(buffer, { type: MIME_TYPES.pdf, disposition: contentDisposition(`${base}.pdf`) });
      }
      case 'docx': {
        if (kind === 'docx') throw new BadRequestException('This file is already a Word document.');
        const buffer = await this.docx.fromHtml(/<html/i.test(html) ? html : wrapHtml(html, base), { title: base });
        return new StreamableFile(buffer, { type: MIME_TYPES.docx, disposition: contentDisposition(`${base}.docx`) });
      }
      case 'html':
        return new StreamableFile(Buffer.from(/<html/i.test(html) ? html : wrapHtml(html, base), 'utf8'), {
          type: MIME_TYPES.html,
          disposition: contentDisposition(`${base}.html`),
        });
      default: {
        const text = html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|h\d|li|div)>/gi, '\n')
          .replace(/<[^>]+>/g, '');
        return new StreamableFile(Buffer.from(text, 'utf8'), {
          type: MIME_TYPES.txt,
          disposition: contentDisposition(`${base}.txt`),
        });
      }
    }
  }
}
