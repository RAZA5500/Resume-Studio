import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends the site's own emails (account verification) through SMTP — e.g. a Hostinger mailbox such
 * as no-reply@your-domain (smtp.hostinger.com, port 465). Without SMTP settings email is off, and
 * accounts are not asked to verify their address (nobody could receive the code).
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger('Mail');
  private transport: Pick<Transporter, 'sendMail' | 'verify'> | null = null;
  readonly from: string | null = null;

  constructor(config: ConfigService) {
    const get = (key: string) => config.get<string>(key)?.trim() ?? '';
    const host = get('SMTP_HOST');
    const user = get('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS') ?? '';
    if (!host || !user || !pass) {
      this.logger.log('Email is off (SMTP_HOST / SMTP_USER / SMTP_PASS not set): new accounts are not asked to verify their email.');
      return;
    }
    const port = Number(get('SMTP_PORT')) || 465;
    const secureSetting = get('SMTP_SECURE').toLowerCase();
    const secure = secureSetting ? secureSetting === 'true' : port === 465;
    this.from = get('MAIL_FROM') || `ResumeStudio <${user}>`;
    this.transport = createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  get enabled(): boolean {
    return !!this.transport;
  }

  /** Checks the SMTP login at startup (in the background) so a wrong password shows up in the log. */
  onModuleInit(): void {
    if (!this.transport) return;
    this.transport
      .verify()
      .then(() => this.logger.log(`Email is on: sending as ${this.from}.`))
      .catch((error: unknown) => this.logger.error(`SMTP connection failed — verification emails cannot be sent: ${(error as Error).message}`));
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) throw new Error('Email is not configured');
    await this.transport.sendMail({ from: this.from ?? undefined, ...message });
  }
}
