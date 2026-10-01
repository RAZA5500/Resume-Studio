import { Module } from '@nestjs/common';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { ResumeAiService } from './resume-ai.service.js';

@Module({
  imports: [ExtractionModule, ResumesModule],
  controllers: [AiController],
  providers: [AiService, ResumeAiService],
  exports: [ResumeAiService],
})
export class AiModule {}
