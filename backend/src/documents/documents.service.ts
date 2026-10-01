import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageService } from '../billing/usage.service.js';
import { decodeOriginalName, detectFileKind, extensionOf } from '../common/files.js';
import { escapeHtml, textToHtml } from '../common/utils.js';
import { TextExtractionService } from '../extraction/text-extraction.service.js';
import { DocumentFile, type DocumentKind } from './document.entity.js';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto.js';

const RICH_SOURCES = new Set(['docx', 'doc', 'text', 'rtf', 'html']);

@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly uploadDir: string;

  constructor(
    @InjectRepository(DocumentFile) private readonly documents: Repository<DocumentFile>,
    private readonly extraction: TextExtractionService,
    private readonly usage: UsageService,
    config: ConfigService,
  ) {
    const dir = config.get<string>('UPLOAD_DIR') || 'uploads';
    this.uploadDir = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.uploadDir, { recursive: true });
  }

  list(userId: string): Promise<DocumentFile[]> {
    return this.documents.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  async get(userId: string, id: string, withState = false): Promise<DocumentFile> {
    const query = this.documents
      .createQueryBuilder('d')
      .where('d.id = :id AND d.userId = :userId', { id, userId })
      .addSelect('d.storageKey');
    if (withState) query.addSelect('d.editorState');
    const document = await query.getOne();
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async upload(userId: string, file: Express.Multer.File, name?: string): Promise<DocumentFile> {
    const originalName = decodeOriginalName(file.originalname);
    const fileKind = detectFileKind(originalName, file.mimetype);
    let kind: DocumentKind;
    if (fileKind === 'pdf') kind = 'pdf';
    else if (fileKind === 'image') kind = 'image';
    else if (RICH_SOURCES.has(fileKind)) kind = 'rich';
    else throw new BadRequestException('Unsupported file. Upload a PDF, image, Word, text, RTF or HTML document.');
    await this.usage.assertAllowed(userId, 'document');

    const extension = extensionOf(originalName) || fileKind;
    const storageKey = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadDir, storageKey), file.buffer);

    const document = this.documents.create({
      userId,
      name: (name?.trim() || originalName.replace(/\.[^.]+$/, '') || 'Untitled').slice(0, 200),
      kind,
      sourceFormat: extension,
      originalName,
      mimeType: file.mimetype,
      size: file.size,
      storageKey,
      editorState: null,
      thumbnail: null,
      pageCount: null,
    });
    const saved = await this.documents.save(document);
    await this.usage.record(userId, 'document', saved.id);
    return this.get(userId, saved.id);
  }

  async createBlank(userId: string, dto: CreateDocumentDto): Promise<DocumentFile> {
    await this.usage.assertAllowed(userId, 'document');
    const editorState =
      dto.kind === 'rich'
        ? { html: dto.html ?? '<h1>Untitled document</h1><p></p>' }
        : {
            version: 1,
            pages: [{ source: { type: 'blank', width: dto.width ?? 794, height: dto.height ?? 1123 }, rotation: 0, objects: null }],
          };
    const document = this.documents.create({
      userId,
      name: dto.name.trim(),
      kind: dto.kind,
      sourceFormat: null,
      originalName: null,
      mimeType: null,
      size: 0,
      storageKey: null,
      editorState,
      thumbnail: null,
      pageCount: 1,
    });
    const saved = await this.documents.save(document);
    await this.usage.record(userId, 'document', saved.id);
    return this.get(userId, saved.id, true);
  }

  async update(userId: string, id: string, dto: UpdateDocumentDto): Promise<DocumentFile> {
    const document = await this.get(userId, id);
    // Editing content counts once per document per day on the free plan (renames are free).
    if (dto.editorState !== undefined) await this.usage.assertAllowed(userId, 'document', id);
    if (dto.name !== undefined) document.name = dto.name.trim();
    if (dto.editorState !== undefined) document.editorState = dto.editorState;
    if (dto.thumbnail !== undefined) document.thumbnail = dto.thumbnail;
    if (dto.pageCount !== undefined) document.pageCount = dto.pageCount;
    await this.documents.save(document);
    if (dto.editorState !== undefined) await this.usage.record(userId, 'document', id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const document = await this.get(userId, id);
    if (document.storageKey) await rm(join(this.uploadDir, document.storageKey), { force: true });
    await this.documents.delete({ id: document.id });
    return { success: true };
  }

  async readFile(userId: string, id: string): Promise<{ document: DocumentFile; buffer: Buffer }> {
    const document = await this.get(userId, id);
    if (!document.storageKey) throw new NotFoundException('This document has no uploaded file');
    try {
      return { document, buffer: await readFile(join(this.uploadDir, document.storageKey)) };
    } catch {
      throw new NotFoundException('The stored file is missing');
    }
  }

  /** HTML version of an uploaded Word/text document for the rich-text editor. */
  async toHtml(userId: string, id: string): Promise<{ html: string }> {
    const { document, buffer } = await this.readFile(userId, id);
    const kind = detectFileKind(document.originalName ?? '', document.mimeType ?? undefined);
    if (kind === 'docx') return { html: await this.extraction.docxToHtml(buffer) };
    if (kind === 'html') {
      const raw = buffer.toString('utf8');
      const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(raw)?.[1] ?? raw;
      return { html: body.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '') };
    }
    if (kind === 'text' && /\.(md|markdown)$/i.test(document.originalName ?? '')) {
      return { html: this.markdownToHtml(buffer.toString('utf8')) };
    }
    const extracted = await this.extraction.extract({
      buffer,
      originalname: document.originalName ?? 'file.txt',
      mimetype: document.mimeType ?? undefined,
    });
    return { html: textToHtml(extracted.text) };
  }

  async extractText(userId: string, id: string) {
    const { document, buffer } = await this.readFile(userId, id);
    return this.extraction.extract({
      buffer,
      originalname: document.originalName ?? 'file',
      mimetype: document.mimeType ?? undefined,
    });
  }

  /** Minimal Markdown support (headings, lists, emphasis, paragraphs). */
  private markdownToHtml(markdown: string): string {
    const inline = (s: string) =>
      escapeHtml(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
    const html: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (list.length) html.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
      list = [];
    };
    for (const line of markdown.replace(/\r/g, '').split('\n')) {
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      const item = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      } else if (item) {
        list.push(item[1]);
      } else if (line.trim()) {
        flush();
        html.push(`<p>${inline(line)}</p>`);
      } else {
        flush();
      }
    }
    flush();
    return html.join('\n');
  }
}
