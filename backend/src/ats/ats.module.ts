import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module.js';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { AtsReport } from './ats-report.entity.js';
import { AtsController } from './ats.controller.js';
import { AtsService } from './ats.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AtsReport]), ExtractionModule, ResumesModule, AiModule],
  controllers: [AtsController],
  providers: [AtsService],
})
export class AtsModule {}
