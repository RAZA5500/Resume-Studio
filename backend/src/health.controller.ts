import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResumeAiService } from './ai/resume-ai.service.js';
import { Public } from './common/auth/auth.decorators.js';
import { PdfRendererService } from './export/pdf-renderer.service.js';

export let lastDatabaseError: string | null = null;
export function setLastDatabaseError(err: string | null) {
  lastDatabaseError = err;
}

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
    let dbDetails: string | undefined = undefined;

    if (!this.dataSource.isInitialized) {
      database = 'connecting';
      dbDetails = lastDatabaseError ?? 'Database initializing in background...';
    } else {
      try {
        await this.dataSource.query('SELECT 1');
      } catch (err) {
        database = 'down';
        dbDetails = (err as Error).message;
      }
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      ...(dbDetails ? { dbDetails } : {}),
      ai: this.resumeAi.status,
      pdfEngine: this.pdf.available,
      time: new Date().toISOString(),
    };
  }
}

