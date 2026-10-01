import { existsSync } from 'node:fs';
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { type Browser } from 'puppeteer-core';

export interface PdfOptions {
  pageSize?: 'A4' | 'Letter';
  landscape?: boolean;
}

/** Only fonts (and inline data) may be fetched while rendering user supplied HTML. */
const ALLOWED_REQUEST = /^(data:|blob:|about:blank|https:\/\/fonts\.(googleapis|gstatic)\.com\/)/;

/**
 * Renders HTML to a real, text-based (ATS readable) PDF using a headless
 * Chromium based browser. No browser download is needed: we reuse the Chrome or
 * Edge already installed on the machine (override with CHROME_PATH).
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browser: Promise<Browser> | null = null;
  private readonly executablePath: string | undefined;

  constructor(config: ConfigService) {
    this.executablePath = this.detectBrowser(config.get<string>('CHROME_PATH'));
    if (this.executablePath) this.logger.log(`PDF engine: ${this.executablePath}`);
    else this.logger.warn('No Chrome/Edge/Chromium found — server-side PDF export disabled (set CHROME_PATH).');
  }

  get available(): boolean {
    return !!this.executablePath;
  }

  async render(html: string, options: PdfOptions = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (ALLOWED_REQUEST.test(request.url())) void request.continue();
        else void request.abort();
      });
      await page.setContent(html, { waitUntil: 'load', timeout: 45_000 });
      // Web fonts are fetched after layout — wait for them so the PDF embeds the right typefaces.
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 15_000 }).catch(() => undefined);
      const pdf = await page.pdf({
        format: options.pageSize === 'Letter' ? 'Letter' : 'A4',
        landscape: options.landscape ?? false,
        printBackground: true,
        preferCSSPageSize: true,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browser) return;
    const browser = await this.browser.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  private getBrowser(): Promise<Browser> {
    if (!this.executablePath) {
      throw new ServiceUnavailableException(
        'PDF engine unavailable. Install Google Chrome / Microsoft Edge or set CHROME_PATH in backend/.env.',
      );
    }
    if (!this.browser) {
      this.browser = puppeteer
        .launch({
          executablePath: this.executablePath,
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
        })
        .then((browser) => {
          browser.on('disconnected', () => (this.browser = null));
          return browser;
        })
        .catch((error: unknown) => {
          this.browser = null;
          this.logger.error(`Failed to launch browser: ${String(error)}`);
          throw new ServiceUnavailableException('Could not start the PDF engine.');
        });
    }
    return this.browser;
  }

  private detectBrowser(configured?: string): string | undefined {
    const localAppData = process.env['LOCALAPPDATA'];
    const candidates = [
      configured,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      localAppData ? `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/snap/bin/chromium',
    ];
    return candidates.find((path): path is string => !!path && existsSync(path));
  }
}
