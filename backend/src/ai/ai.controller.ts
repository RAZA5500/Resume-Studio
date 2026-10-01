import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { UsageService } from '../billing/usage.service.js';
import { CurrentUser, Public, type AuthUser } from '../common/auth/auth.decorators.js';
import { decodeOriginalName, MAX_UPLOAD_BYTES } from '../common/files.js';
import { TextExtractionService } from '../extraction/text-extraction.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import {
  BulletsDto,
  CoverLetterDto,
  GenerateResumeDto,
  ImproveTextDto,
  ParseResumeDto,
  SkillsDto,
  SummaryDto,
  TailorDto,
} from './dto/ai.dto.js';
import { ResumeAiService } from './resume-ai.service.js';

@Throttle({ default: { limit: 40, ttl: 60_000 } })
@Controller('ai')
export class AiController {
  constructor(
    private readonly resumeAi: ResumeAiService,
    private readonly extraction: TextExtractionService,
    private readonly resumes: ResumesService,
    private readonly usage: UsageService,
  ) {}

  /**
   * Generating or importing content for a brand-new resume counts against the
   * free daily resume allowance; filling an existing resume (resumeId) does not.
   */
  private async assertResumeAllowance(userId: string, resumeId?: string): Promise<void> {
    if (resumeId) {
      await this.resumes.get(userId, resumeId);
      return;
    }
    await this.usage.assertAllowed(userId, 'resume');
  }

  /** AI model calls count against the daily fair-use cap; the offline assistant is free. */
  private async consumeAi(userId: string): Promise<void> {
    if (this.resumeAi.status.enabled) await this.usage.consumeAi(userId);
  }

  @Public()
  @Get('status')
  status() {
    return this.resumeAi.status;
  }

  @HttpCode(200)
  @Post('generate-resume')
  async generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateResumeDto) {
    await this.assertResumeAllowance(user.id, dto.resumeId);
    await this.consumeAi(user.id);
    return this.resumeAi.generateResume(dto.prompt, dto.targetRole, dto.experienceLevel);
  }

  /** Upload an existing resume (PDF / DOCX / image …) and get structured content back. */
  @HttpCode(200)
  @Post('parse-resume')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async parse(
    @CurrentUser() user: AuthUser,
    @Body() dto: ParseResumeDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Please attach a resume file.');
    await this.assertResumeAllowance(user.id, dto.resumeId);
    const extracted = await this.extraction.extract({
      buffer: file.buffer,
      originalname: decodeOriginalName(file.originalname),
      mimetype: file.mimetype,
    });
    await this.consumeAi(user.id);
    const parsed = await this.resumeAi.parseResumeText(extracted.text);
    return { ...parsed, warnings: extracted.warnings };
  }

  @HttpCode(200)
  @Post('summary')
  async summary(@CurrentUser() user: AuthUser, @Body() dto: SummaryDto) {
    await this.consumeAi(user.id);
    return this.resumeAi.summaries(dto.content, dto.targetRole, dto.tone);
  }

  @HttpCode(200)
  @Post('improve')
  async improve(@CurrentUser() user: AuthUser, @Body() dto: ImproveTextDto) {
    await this.consumeAi(user.id);
    return this.resumeAi.improve(dto.text, dto.mode, dto.instruction, dto.context);
  }

  @HttpCode(200)
  @Post('bullets')
  async bullets(@CurrentUser() user: AuthUser, @Body() dto: BulletsDto) {
    await this.consumeAi(user.id);
    return this.resumeAi.bullets(dto.jobTitle, dto.company, dto.context, dto.count ?? 5, dto.existing ?? []);
  }

  @HttpCode(200)
  @Post('skills')
  async skills(@CurrentUser() user: AuthUser, @Body() dto: SkillsDto) {
    await this.consumeAi(user.id);
    return this.resumeAi.skills(dto.jobTitle, dto.existing ?? [], dto.jobDescription);
  }

  @HttpCode(200)
  @Post('tailor')
  async tailor(@CurrentUser() user: AuthUser, @Body() dto: TailorDto) {
    await this.consumeAi(user.id);
    return this.resumeAi.tailor(dto.content, dto.jobDescription);
  }

  @HttpCode(200)
  @Post('cover-letter')
  async coverLetter(@CurrentUser() user: AuthUser, @Body() dto: CoverLetterDto) {
    await this.usage.assertAllowed(user.id, 'cover_letter');
    let content: unknown = dto.content;
    if (!content && dto.resumeId) content = (await this.resumes.get(user.id, dto.resumeId)).content;
    if (!content) throw new BadRequestException('Choose a resume to base the cover letter on.');
    await this.consumeAi(user.id);
    const letter = await this.resumeAi.coverLetter(content, dto.jobDescription, dto.company, dto.hiringManager, dto.tone);
    await this.usage.record(user.id, 'cover_letter');
    return letter;
  }
}
