import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../common/auth/auth.decorators.js';
import { MAX_UPLOAD_BYTES } from '../common/files.js';
import { AtsService } from './ats.service.js';
import { AnalyzeFileDto, AnalyzeResumeDto, AnalyzeTextDto } from './dto/ats.dto.js';

@Controller('ats')
export class AtsController {
  constructor(private readonly ats: AtsService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('analyze-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  analyzeFile(
    @CurrentUser() user: AuthUser,
    @Body() dto: AnalyzeFileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Please upload your resume file.');
    return this.ats.analyzeFile(user.id, file, {
      jobDescription: dto.jobDescription,
      jobTitle: dto.jobTitle,
      useAi: dto.useAi === 'true',
    });
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('analyze-resume')
  analyzeResume(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeResumeDto) {
    return this.ats.analyzeResume(user.id, dto.resumeId, {
      jobDescription: dto.jobDescription,
      jobTitle: dto.jobTitle,
      useAi: dto.useAi === true,
    });
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('analyze-text')
  analyzeText(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeTextDto) {
    return this.ats.analyzeText(user.id, dto.text, {
      jobDescription: dto.jobDescription,
      jobTitle: dto.jobTitle,
      useAi: dto.useAi === true,
    });
  }

  @Get('reports')
  list(@CurrentUser() user: AuthUser) {
    return this.ats.list(user.id);
  }

  @Get('reports/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ats.get(user.id, id);
  }

  @Delete('reports/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ats.remove(user.id, id);
  }
}
