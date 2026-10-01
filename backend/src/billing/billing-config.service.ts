import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type UsageKind = 'resume' | 'cover_letter' | 'document';
/** Stored usage rows: the plan limits above plus AI model calls (fair-use cap). */
export type UsageEventKind = UsageKind | 'ai';

export interface PaymentMethodInfo {
  key: 'jazzcash' | 'easypaisa' | 'bank';
  label: string;
  accountTitle: string;
  accountNumber: string;
}

function intSetting(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Pricing, free-plan limits, payment accounts and admin list — all from backend/.env. */
@Injectable()
export class BillingConfigService {
  readonly price: number;
  readonly currency = 'PKR';
  readonly timezone: string;
  /** Daily limits for free users; a negative value means unlimited. */
  readonly limits: Record<UsageKind, number>;
  /** Fair-use cap on AI model calls per user per day, protecting API costs; negative = unlimited. */
  readonly aiLimits: { free: number; lifetime: number };
  readonly methods: PaymentMethodInfo[];
  readonly supportWhatsapp: string | null;
  private readonly adminEmails: Set<string>;

  constructor(config: ConfigService) {
    const get = (key: string) => config.get<string>(key)?.trim() || '';
    this.price = intSetting(get('LIFETIME_PRICE_PKR'), 99);
    this.timezone = get('APP_TIMEZONE') || 'Asia/Karachi';
    this.limits = {
      resume: intSetting(get('FREE_DAILY_RESUMES'), 1),
      cover_letter: intSetting(get('FREE_DAILY_COVER_LETTERS'), 1),
      document: intSetting(get('FREE_DAILY_DOCUMENTS'), 1),
    };
    this.aiLimits = {
      free: intSetting(get('AI_DAILY_LIMIT_FREE'), 20),
      lifetime: intSetting(get('AI_DAILY_LIMIT_LIFETIME'), 100),
    };
    const methods: PaymentMethodInfo[] = [
      { key: 'jazzcash', label: 'JazzCash', accountTitle: get('PAYMENT_JAZZCASH_TITLE'), accountNumber: get('PAYMENT_JAZZCASH_NUMBER') },
      { key: 'easypaisa', label: 'Easypaisa', accountTitle: get('PAYMENT_EASYPAISA_TITLE'), accountNumber: get('PAYMENT_EASYPAISA_NUMBER') },
      {
        key: 'bank',
        label: get('PAYMENT_BANK_NAME') || 'Bank transfer',
        accountTitle: get('PAYMENT_BANK_TITLE'),
        accountNumber: get('PAYMENT_BANK_ACCOUNT'),
      },
    ];
    this.methods = methods.filter((m) => m.accountNumber);
    this.supportWhatsapp = get('SUPPORT_WHATSAPP') || null;
    this.adminEmails = new Set(
      get('ADMIN_EMAILS')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  isAdmin(email: string | undefined | null): boolean {
    return !!email && this.adminEmails.has(email.toLowerCase());
  }

  /** Current calendar day ("YYYY-MM-DD") in the app timezone — limits reset at local midnight. */
  today(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  /** The moment the current day ends in the app timezone. */
  resetsAt(now = new Date()): Date {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const elapsed = (value('hour') * 3600 + value('minute') * 60 + value('second')) * 1000;
    return new Date(now.getTime() - (now.getTime() % 1000) + (86_400_000 - elapsed));
  }
}
