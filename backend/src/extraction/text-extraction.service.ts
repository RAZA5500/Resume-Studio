import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  UnprocessableEntityException,
} from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import WordExtractor from 'word-extractor';
import { detectFileKind, type FileKind } from '../common/files.js';
import { decodeEntities, htmlToText } from '../common/utils.js';

export interface ExtractionInput {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}

export interface ExtractionResult {
  text: string;
  kind: FileKind;
  method: 'text' | 'ocr';
  pages: number | null;
  warnings: string[];
}

const MAX_OCR_PAGES = 4;

@Injectable()
export class TextExtractionService implements OnModuleDestroy {
  private readonly logger = new Logger(TextExtractionService.name);
  private worker: Promise<Tesseract.Worker> | null = null;
  private ocrQueue: Promise<unknown> = Promise.resolve();
  private readonly cachePath = join(process.cwd(), '.cache', 'tesseract');

  async extract(file: ExtractionInput): Promise<ExtractionResult> {
    const kind = detectFileKind(file.originalname, file.mimetype);
    const warnings: string[] = [];

    switch (kind) {
      case 'pdf':
        return this.fromPdf(file.buffer, warnings);
      case 'docx': {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return this.result(result.value, kind, 'text', null, warnings);
      }
      case 'doc': {
        const doc = await new WordExtractor().extract(file.buffer);
        warnings.push('Legacy .doc format detected — .docx or PDF are more ATS friendly.');
        return this.result(doc.getBody(), kind, 'text', null, warnings);
      }
      case 'text':
        return this.result(file.buffer.toString('utf8'), kind, 'text', null, warnings);
      case 'html':
        return this.result(htmlToText(file.buffer.toString('utf8')), kind, 'text', null, warnings);
      case 'rtf':
        return this.result(this.rtfToText(file.buffer.toString('latin1')), kind, 'text', null, warnings);
      case 'image': {
        warnings.push('Image files cannot be read by most ATS systems — text was recovered with OCR.');
        const text = await this.ocr(file.buffer);
        return this.result(text, kind, 'ocr', 1, warnings);
      }
      default:
        throw new BadRequestException(
          'Unsupported file type. Upload a PDF, Word (.docx/.doc), text, RTF, HTML or image file.',
        );
    }
  }

  /** Converts a DOCX buffer to HTML (images embedded as data URLs). */
  async docxToHtml(buffer: Buffer): Promise<string> {
    const result = await mammoth.convertToHtml({ buffer });
    return result.value;
  }

  async ocr(image: Buffer): Promise<string> {
    const job = this.ocrQueue.then(async () => {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(image);
      return data.text;
    });
    this.ocrQueue = job.catch(() => undefined);
    try {
      return await job;
    } catch (error) {
      this.logger.error(`OCR failed: ${String(error)}`);
      throw new UnprocessableEntityException('Could not read text from this image.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.worker) return;
    const worker = await this.worker.catch(() => null);
    await worker?.terminate().catch(() => undefined);
  }

  private async fromPdf(buffer: Buffer, warnings: string[]): Promise<ExtractionResult> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      const text = result.text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '');
      if (text.replace(/\s/g, '').length >= 80) {
        return this.result(text, 'pdf', 'text', result.total, warnings);
      }

      // Scanned / image-only PDF: render the first pages and OCR them.
      warnings.push(
        'This PDF has little or no selectable text (likely scanned or image-based). ATS systems may not read it — text was recovered with OCR.',
      );
      const shots = await parser.getScreenshot({ scale: 2, first: MAX_OCR_PAGES });
      const pages: string[] = [];
      for (const page of shots.pages) {
        pages.push(await this.ocr(Buffer.from(page.data)));
      }
      return this.result(pages.join('\n\n'), 'pdf', 'ocr', result.total, warnings);
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      this.logger.warn(`PDF parse failed: ${String(error)}`);
      throw new UnprocessableEntityException('Could not read this PDF. It may be encrypted or corrupted.');
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private rtfToText(rtf: string): string {
    return decodeEntities(
      rtf
        .replace(/\\par[d]?/g, '\n')
        .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\u(-?\d+)\??/g, (_, code: string) => String.fromCharCode(Number(code) < 0 ? Number(code) + 65536 : Number(code)))
        .replace(/\{\\\*[^{}]*\}/g, '')
        .replace(/\\[a-z]+-?\d* ?/gi, '')
        .replace(/[{}]/g, ''),
    );
  }

  private result(
    raw: string,
    kind: FileKind,
    method: 'text' | 'ocr',
    pages: number | null,
    warnings: string[],
  ): ExtractionResult {
    const text = raw
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) {
      throw new UnprocessableEntityException('No readable text was found in this file.');
    }
    return { text, kind, method, pages, warnings };
  }

  private getWorker(): Promise<Tesseract.Worker> {
    if (!this.worker) {
      mkdirSync(this.cachePath, { recursive: true });
      this.worker = Tesseract.createWorker('eng', 1, { cachePath: this.cachePath }).catch((error: unknown) => {
        this.worker = null;
        throw error;
      });
    }
    return this.worker;
  }
}
