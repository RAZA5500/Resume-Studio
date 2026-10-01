import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, StreamableFile } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/auth/auth.decorators.js';
import { contentDisposition, MIME_TYPES, safeFileBase } from '../common/files.js';
import { resumeToDocxHtml, resumeToPlainText } from '../common/resume/resume-text.js';
import { DocxService } from '../export/docx.service.js';
import { CreateResumeDto, UpdateResumeDto } from './dto/resume.dto.js';
import { ResumesService } from './resumes.service.js';

@Controller('resumes')
export class ResumesController {
  constructor(
    private readonly resumes: ResumesService,
    private readonly docx: DocxService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.resumes.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateResumeDto) {
    return this.resumes.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.get(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateResumeDto) {
    return this.resumes.update(user.id, id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.duplicate(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.remove(user.id, id);
  }

  /** ATS-optimised Word export generated from the structured content. */
  @Get(':id/export/docx')
  async exportDocx(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const resume = await this.resumes.get(user.id, id);
    const buffer = await this.docx.fromHtml(resumeToDocxHtml(resume.content, resume.design), {
      title: resume.title,
      pageSize: resume.design.pageSize,
      font: resume.design.bodyFont,
    });
    return new StreamableFile(buffer, {
      type: MIME_TYPES.docx,
      disposition: contentDisposition(`${safeFileBase(resume.title, 'resume')}.docx`),
    });
  }

  @Get(':id/export/txt')
  async exportText(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const resume = await this.resumes.get(user.id, id);
    return new StreamableFile(Buffer.from(resumeToPlainText(resume.content), 'utf8'), {
      type: MIME_TYPES.txt,
      disposition: contentDisposition(`${safeFileBase(resume.title, 'resume')}.txt`),
    });
  }
}
