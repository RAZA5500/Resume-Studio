import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResumeAiService } from './ai/resume-ai.service.js';
import { Public } from './common/auth/auth.decorators.js';
import { DatabaseService } from './database/database.service.js';
import { PdfRendererService } from './export/pdf-renderer.service.js';
import { MailService } from './mail/mail.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly database: DatabaseService,
    private readonly resumeAi: ResumeAiService,
    private readonly pdf: PdfRendererService,
    private readonly mail: MailService,
  ) {}

  @Get()
  async check() {
    const db = this.database.status();
    let database: string = db.state;
    let dbError = db.error;
    let dbHint = db.hint;

    if (this.database.isReady) {
      try {
        await this.dataSource.query('SELECT 1');
        database = 'up';
      } catch (err) {
        database = 'down';
        dbError = (err as Error).message;
        dbHint = undefined;
      }
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      // up | connecting | migrating | retrying | misconfigured | down
      database,
      ...(dbError ? { dbError } : {}),
      ...(dbHint ? { dbHint } : {}),
      ai: this.resumeAi.status,
      pdfEngine: this.pdf.available,
      // off | checking | ok | failed — failed: verification emails are not going out (see the log).
      email: this.mail.status,
      time: new Date().toISOString(),
    };
  }
}
