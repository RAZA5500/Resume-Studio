import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService } from './mail.service.js';
import { verificationEmail } from './templates.js';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn((_message: object) => Promise.resolve({})) }));
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail, verify: () => Promise.resolve(true) })) }));

function mailWith(env: Record<string, string>): MailService {
  return new MailService({ get: (key: string) => env[key] } as unknown as ConfigService);
}

const SMTP = { SMTP_HOST: 'smtp.hostinger.com', SMTP_USER: 'no-reply@resumestudio.pk', SMTP_PASS: 'mailbox-password' };

describe('MailService', () => {
  beforeAll(() => vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());
  beforeEach(() => vi.mocked(createTransport).mockClear());

  it('is off until host, user and password are all set', async () => {
    for (const env of [{}, { ...SMTP, SMTP_PASS: '' }, { ...SMTP, SMTP_HOST: ' ' }]) {
      const mail = mailWith(env);
      expect(mail.enabled).toBe(false);
      await expect(mail.send({ to: 'a@b.co', subject: 's', html: 'h', text: 't' })).rejects.toThrow('not configured');
    }
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('uses SSL on port 465 by default and STARTTLS on 587, sending as the mailbox', async () => {
    const mail = mailWith(SMTP);
    expect(mail.enabled).toBe(true);
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: 'smtp.hostinger.com', port: 465, secure: true, auth: { user: SMTP.SMTP_USER, pass: SMTP.SMTP_PASS } }),
    );
    await mail.send({ to: 'sara@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    expect(sendMail).toHaveBeenLastCalledWith(expect.objectContaining({ from: 'ResumeStudio <no-reply@resumestudio.pk>', to: 'sara@example.com' }));

    mailWith({ ...SMTP, SMTP_PORT: '587', MAIL_FROM: 'ResumeStudio <hello@resumestudio.pk>' });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 587, secure: false }));
    mailWith({ ...SMTP, SMTP_PORT: '2525', SMTP_SECURE: 'true' });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 2525, secure: true }));
  });

  it('reports its state for the health check: off, checking, then ok or failed', async () => {
    expect(mailWith({}).status).toBe('off');
    const mail = mailWith(SMTP);
    expect(mail.status).toBe('checking');
    await mail.send({ to: 'sara@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    expect(mail.status).toBe('ok');
    sendMail.mockRejectedValueOnce(new Error('Invalid login: 535'));
    await expect(mail.send({ to: 'sara@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' })).rejects.toThrow('535');
    expect(mail.status).toBe('failed');
  });
});

describe('verificationEmail', () => {
  it('carries the code and the link in both versions, and escapes the name', () => {
    const email = verificationEmail({
      to: 'sara@example.com',
      name: '<b>Sara</b> Khan',
      code: '042917',
      link: 'https://resumestudio.pk/verify-email?token=abc&x=1',
      minutes: 30,
    });
    expect(email.subject).toBe('042917 is your ResumeStudio verification code');
    expect(email.html).toContain('0 4 2 9 1 7');
    expect(email.html).toContain('href="https://resumestudio.pk/verify-email?token=abc&#38;x=1"');
    expect(email.html).toContain('Hi &#60;b&#62;Sara&#60;/b&#62;,');
    expect(email.html).not.toContain('<b>Sara');
    expect(email.text).toContain('042917');
    expect(email.text).toContain('https://resumestudio.pk/verify-email?token=abc&x=1');
    expect(email.text).toContain('30 minutes');
  });
});
