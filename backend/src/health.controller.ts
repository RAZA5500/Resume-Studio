import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResumeAiService } from './ai/resume-ai.service.js';
import { Public } from './common/auth/auth.decorators.js';
import { PdfRendererService } from './export/pdf-renderer.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resumeAi: ResumeAiService,
    private readonly pdf: PdfRendererService,
  ) {}

  @Get()
  async check() {
    let database = 'up';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      ai: this.resumeAi.status,
      pdfEngine: this.pdf.available,
      time: new Date().toISOString(),
    };
  }
}
