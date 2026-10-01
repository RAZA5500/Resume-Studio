import { Module } from '@nestjs/common';
import { TextExtractionService } from './text-extraction.service.js';

@Module({
  providers: [TextExtractionService],
  exports: [TextExtractionService],
})
export class ExtractionModule {}
