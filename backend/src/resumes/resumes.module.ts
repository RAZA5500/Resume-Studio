import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportModule } from '../export/export.module.js';
import { TemplatesModule } from '../templates/templates.module.js';
import { UsersModule } from '../users/users.module.js';
import { Resume } from './resume.entity.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Resume]), TemplatesModule, UsersModule, ExportModule],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
