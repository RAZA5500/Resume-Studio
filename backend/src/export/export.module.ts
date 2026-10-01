import { Module } from '@nestjs/common';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { DocxService } from './docx.service.js';
import { ExportController } from './export.controller.js';
import { PdfRendererService } from './pdf-renderer.service.js';

@Module({
  imports: [ExtractionModule],
  controllers: [ExportController],
  providers: [PdfRendererService, DocxService],
  exports: [PdfRendererService, DocxService],
})
export class ExportModule {}
