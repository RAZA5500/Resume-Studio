import type { MailMessage } from './mail.service.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * "Verify your email" with both a 6-digit code (typed into the app — handy on the phone) and a
 * button link. Table layout with inline styles: what email clients render reliably.
 */
export function verificationEmail(options: { to: string; name: string; code: string; link: string; minutes: number }): MailMessage {
  const firstName = options.name.split(/\s+/)[0] || 'there';
  const name = escapeHtml(firstName);
  const link = escapeHtml(options.link);
  const spacedCode = options.code.split('').join(' ');
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify your email</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <span style="display:none;max-height:0;overflow:hidden">Your ResumeStudio code is ${options.code}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px 28px">
        <tr><td style="font-size:20px;font-weight:800;letter-spacing:-0.5px">Resume<span style="color:#2563eb">Studio</span></td></tr>
        <tr><td style="padding-top:22px;font-size:22px;font-weight:700">Verify your email</td></tr>
        <tr><td style="padding-top:10px;font-size:15px;line-height:1.6;color:#334155">
          Hi ${name}, enter this code in ResumeStudio to confirm that this email address is yours:
        </td></tr>
        <tr><td align="center" style="padding:22px 0">
          <div style="display:inline-block;padding:14px 22px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:6px;color:#1e3a8a">${spacedCode}</div>
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#334155">Or confirm with one click:</td></tr>
        <tr><td align="center" style="padding:18px 0 6px">
          <a href="${link}" style="display:inline-block;padding:13px 26px;border-radius:12px;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">Verify email address</a>
        </td></tr>
        <tr><td style="padding-top:18px;font-size:13px;line-height:1.6;color:#64748b">
          The code and the link work for ${options.minutes} minutes. If you did not create a ResumeStudio account, you can ignore this email.
        </td></tr>
      </table>
      <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">ResumeStudio · this is an automated message, please do not reply.</p>
    </td></tr>
  </table>
</body>
</html>`;
  const text = [
    `Hi ${firstName},`,
    '',
    `Your ResumeStudio verification code is: ${options.code}`,
    '',
    `Or open this link to verify your email: ${options.link}`,
    '',
    `The code and the link work for ${options.minutes} minutes. If you did not create a ResumeStudio account, ignore this email.`,
  ].join('\n');
  return { to: options.to, subject: `${options.code} is your ResumeStudio verification code`, html, text };
}
