import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, type AuthUser } from '../common/auth/auth.decorators.js';
import { contentDisposition, decodeOriginalName, MAX_UPLOAD_BYTES } from '../common/files.js';
import { TextExtractionService } from '../extraction/text-extraction.service.js';
import { DocumentsService } from './documents.service.js';
import { CreateDocumentDto, UpdateDocumentDto, UploadDocumentDto } from './dto/document.dto.js';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly extraction: TextExtractionService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.documents.list(user.id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadDocumentDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please choose a file to upload.');
    return this.documents.upload(user.id, file, dto.name);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentDto) {
    return this.documents.createBlank(user.id, dto);
  }

  /** OCR / text extraction for any uploaded file (image to text, PDF to text…). */
  @HttpCode(200)
  @Post('extract-text')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  extractUploaded(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please choose a file.');
    return this.extraction.extract({
      buffer: file.buffer,
      originalname: decodeOriginalName(file.originalname),
      mimetype: file.mimetype,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(user.id, id, true);
  }

  @Get(':id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { document, buffer } = await this.documents.readFile(user.id, id);
    return new StreamableFile(buffer, {
      type: document.mimeType ?? 'application/octet-stream',
      disposition: contentDisposition(document.originalName ?? `${document.name}.${document.sourceFormat}`, 'inline'),
    });
  }

  @Get(':id/html')
  html(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.toHtml(user.id, id);
  }

  @HttpCode(200)
  @Post(':id/extract-text')
  extract(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.extractText(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.remove(user.id, id);
  }
}
