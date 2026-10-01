import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResumeAiService } from '../ai/resume-ai.service.js';
import type { AiAnalysis } from '../ai/ai.types.js';
import { AiLimitReachedException, UsageService } from '../billing/usage.service.js';
import { decodeOriginalName } from '../common/files.js';
import { resumeToPlainText } from '../common/resume/resume-text.js';
import { TextExtractionService } from '../extraction/text-extraction.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { LAYOUTS } from '../templates/template-catalog.js';
import { AtsReport } from './ats-report.entity.js';
import { scoreResume, type AtsInput } from './ats-scorer.js';

interface AnalysisOptions {
  jobDescription?: string;
  jobTitle?: string;
  useAi?: boolean;
}

@Injectable()
export class AtsService {
  private readonly logger = new Logger(AtsService.name);

  constructor(
    @InjectRepository(AtsReport) private readonly reports: Repository<AtsReport>,
    private readonly extraction: TextExtractionService,
    private readonly resumes: ResumesService,
    private readonly resumeAi: ResumeAiService,
    private readonly usage: UsageService,
  ) {}

  async analyzeFile(userId: string, file: Express.Multer.File, options: AnalysisOptions): Promise<AtsReport> {
    const fileName = decodeOriginalName(file.originalname);
    const extracted = await this.extraction.extract({ buffer: file.buffer, originalname: fileName, mimetype: file.mimetype });
    return this.run(
      userId,
      {
        text: extracted.text,
        sourceKind: extracted.kind,
        extractionMethod: extracted.method,
        pages: extracted.pages,
      },
      options,
      { sourceType: 'file', fileName, resumeId: null, warnings: extracted.warnings },
    );
  }

  async analyzeResume(userId: string, resumeId: string, options: AnalysisOptions): Promise<AtsReport> {
    const resume = await this.resumes.get(userId, resumeId);
    const layout = LAYOUTS.find((l) => l.key === resume.design.layout);
    const report = await this.run(
      userId,
      { text: resumeToPlainText(resume.content), sourceKind: 'resume', columns: layout?.columns ?? 1 },
      options,
      { sourceType: 'resume', fileName: resume.title, resumeId, warnings: [] },
    );
    await this.resumes.setAtsScore(userId, resumeId, report.score);
    return report;
  }

  analyzeText(userId: string, text: string, options: AnalysisOptions): Promise<AtsReport> {
    return this.run(userId, { text, sourceKind: 'text' }, options, {
      sourceType: 'text',
      fileName: null,
      resumeId: null,
      warnings: [],
    });
  }

  list(userId: string): Promise<AtsReport[]> {
    return this.reports.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
      select: {
        id: true,
        resumeId: true,
        sourceType: true,
        fileName: true,
        jobTitle: true,
        score: true,
        grade: true,
        aiScore: true,
        createdAt: true,
      },
    });
  }

  async get(userId: string, id: string): Promise<AtsReport> {
    const report = await this.reports.findOneBy({ id, userId });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const report = await this.get(userId, id);
    await this.reports.remove(report);
    return { success: true };
  }

  private async run(
    userId: string,
    input: AtsInput,
    options: AnalysisOptions,
    meta: Pick<AtsReport, 'sourceType' | 'fileName' | 'resumeId' | 'warnings'>,
  ): Promise<AtsReport> {
    const jobDescription = options.jobDescription?.trim() || null;
    const result = scoreResume({ ...input, jobDescription });

    let aiAnalysis: AiAnalysis | null = null;
    if (options.useAi && !this.resumeAi.status.enabled) {
      meta.warnings = [...meta.warnings, 'AI deep analysis is not available right now — showing the ATS scan only.'];
    } else if (options.useAi) {
      try {
        await this.usage.consumeAi(userId);
        aiAnalysis = await this.resumeAi.analyze(input.text, jobDescription);
      } catch (error) {
        if (error instanceof AiLimitReachedException) {
          meta.warnings = [...meta.warnings, "You have used today's AI requests — showing the ATS scan without the AI review."];
        } else {
          // The rule-based report is still valuable; surface the AI failure as a warning.
          this.logger.warn(`AI analysis failed: ${String(error)}`);
          meta.warnings = [...meta.warnings, 'AI deep analysis is unavailable right now — showing the ATS scan only.'];
        }
      }
    }

    const report = this.reports.create({
      userId,
      ...meta,
      jobTitle: options.jobTitle?.trim() || null,
      jobDescription,
      extractedText: input.text,
      score: result.score,
      grade: result.grade,
      result,
      aiAnalysis,
      aiScore: aiAnalysis?.overallScore ?? null,
    });
    return this.reports.save(report);
  }
}
