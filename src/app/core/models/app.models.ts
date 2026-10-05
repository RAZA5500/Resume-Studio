import type { DesignSettings, ResumeContent } from './resume.models';

// ---------------------------------------------------------------- users
export type Plan = 'free' | 'lifetime';

export interface User {
  id: string;
  email: string;
  fullName: string;
  headline: string | null;
  plan: Plan;
  planActivatedAt: string | null;
  isAdmin: boolean;
  createdAt: string;
  /** False for accounts that only sign in with Google / Apple. */
  hasPassword?: boolean;
  /** Linked sign-in providers. */
  providers?: OAuthProvider[];
  /** Two-factor sign-in with an authenticator app. */
  twoFactorEnabled?: boolean;
  backupCodesLeft?: number;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
  /** "Remember this device" token, after a two-factor sign-in that asked for it. */
  trustedDevice?: string;
}

/** Sign-in step two: the password (or Google / Apple) was right, now the authenticator code. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challenge: string;
  methods: ('app' | 'backup')[];
}

export interface TwoFactorSetup {
  /** base32, for typing into the app by hand. */
  secret: string;
  uri: string;
  qrSvg: string;
}

export type OAuthProvider = 'google' | 'apple';

// ---------------------------------------------------------------- templates
export interface Template {
  id: string;
  name: string;
  description: string;
  layout: string;
  category: string;
  tags: string[];
  atsFriendly: boolean;
  columns: number;
  hasPhoto: boolean;
  paletteKey: string;
  colorFamily: string;
  fontKey: string;
  popularity: number;
  usageCount: number;
  featured: boolean;
  config: DesignSettings;
}

export interface TemplatePage {
  items: Template[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface TemplateQuery {
  search?: string;
  category?: string;
  layout?: string;
  color?: string;
  font?: string;
  ats?: boolean;
  photo?: '' | 'true' | 'false';
  columns?: '' | '1' | '2';
  sort?: 'popular' | 'name' | 'featured';
  page?: number;
  limit?: number;
}

export interface Palette {
  key: string;
  name: string;
  family: string;
  primary: string;
  accent: string;
}

export interface FontPair {
  key: string;
  name: string;
  heading: string;
  body: string;
  style: 'sans' | 'serif';
}

export interface LayoutInfo {
  key: string;
  name: string;
  description: string;
  columns: number;
  ats: boolean;
  photo: boolean;
}

export interface TemplateMeta {
  total: number;
  categories: Array<{ key: string; label: string; count: number }>;
  layouts: LayoutInfo[];
  palettes: Palette[];
  colorFamilies: string[];
  fonts: FontPair[];
}

// ---------------------------------------------------------------- AI
export type AiSource = 'ai' | 'offline';

export interface AiStatus {
  enabled: boolean;
  model: string | null;
  provider: string;
}

export type ImproveMode =
  | 'bullets'
  | 'summary'
  | 'grammar'
  | 'shorten'
  | 'expand'
  | 'professional'
  | 'quantify'
  | 'simplify'
  | 'custom';

export interface ImproveResult {
  text: string;
  alternatives: string[];
  source: AiSource;
}

export interface SkillSuggestions {
  hardSkills: string[];
  softSkills: string[];
  tools: string[];
  source: AiSource;
}

export interface TailorResult {
  content: ResumeContent;
  changes: string[];
  addedKeywords: string[];
  source: AiSource;
}

export interface CoverLetterResult {
  subject: string;
  body: string;
  source: AiSource;
}

export interface AiAnalysis {
  overallScore: number;
  verdict: 'Excellent' | 'Strong' | 'Average' | 'Weak';
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: Array<{ section: string; priority: 'high' | 'medium' | 'low'; issue: string; suggestion: string }>;
  missingKeywords: string[];
  rewrittenSummary: string;
  bulletRewrites: Array<{ original: string; improved: string }>;
  jobMatch: { score: number; verdict: string; gaps: string[] } | null;
  recommendedRoles: string[];
}

// ---------------------------------------------------------------- ATS
export type AtsStatus = 'good' | 'warn' | 'bad';

export interface AtsCategory {
  key: string;
  label: string;
  score: number;
  max: number;
  status: AtsStatus;
  details: string[];
}

export interface AtsIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  fix: string;
}

export interface AtsResult {
  score: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs Work';
  summary: string;
  breakdown: AtsCategory[];
  keywords: {
    source: 'job-description' | 'general';
    matched: string[];
    missing: string[];
    matchRate: number | null;
    detectedSkills: string[];
  };
  issues: AtsIssue[];
  stats: {
    wordCount: number;
    bulletCount: number;
    actionVerbCount: number;
    quantifiedCount: number;
    avgBulletWords: number;
    pronounCount: number;
    weakPhrases: string[];
    buzzwords: string[];
    sectionsFound: string[];
    sectionsMissing: string[];
    contact: {
      email: string | null;
      phone: string | null;
      linkedin: string | null;
      website: string | null;
      github: string | null;
    };
    pages: number | null;
    readingTimeSec: number;
  };
}

export interface AtsReport {
  id: string;
  resumeId: string | null;
  sourceType: 'file' | 'resume' | 'text';
  fileName: string | null;
  jobTitle: string | null;
  jobDescription?: string | null;
  extractedText?: string;
  score: number;
  grade: string;
  result?: AtsResult;
  aiAnalysis?: AiAnalysis | null;
  aiScore: number | null;
  warnings?: string[];
  createdAt: string;
}

// ---------------------------------------------------------------- documents
export type DocumentKind = 'pdf' | 'image' | 'rich' | 'canvas';

export interface DocumentFile {
  id: string;
  name: string;
  kind: DocumentKind;
  sourceFormat: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number;
  thumbnail: string | null;
  pageCount: number | null;
  editorState?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractionResult {
  text: string;
  kind: string;
  method: 'text' | 'ocr';
  pages: number | null;
  warnings: string[];
}

// ---------------------------------------------------------------- billing
export type UsageKind = 'resume' | 'cover_letter' | 'document';

/** How the buyer paid; checkout shows one JazzCash / Raast QR code that all of these can scan. */
export interface PaymentMethodInfo {
  key: 'jazzcash' | 'easypaisa' | 'bank';
  label: string;
}

export interface BillingConfig {
  price: number;
  currency: string;
  methods: PaymentMethodInfo[];
  freeLimits: Record<UsageKind, number>;
  /** Fair-use cap on AI requests per day; negative = unlimited. */
  aiLimits: { free: number; lifetime: number };
  timezone: string;
  supportWhatsapp: string | null;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

/** QR methods (approved by an admin) plus "gateway" for online payments, approved automatically. */
export type PaymentMethod = PaymentMethodInfo['key'] | 'gateway';

export interface PaymentRecord {
  id: string;
  method: PaymentMethod;
  /** Gateway adapter key for online payments, null for QR payments. */
  provider: string | null;
  transactionId: string;
  senderNumber: string | null;
  senderName: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  adminNote: string | null;
  hasScreenshot: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user?: { id: string; email: string; fullName: string; plan: Plan };
}

export interface BillingSummary {
  plan: Plan;
  day: string;
  resetsAt: string;
  limits: Record<UsageKind, number>;
  used: Record<UsageKind, number>;
  price: number;
  currency: string;
  payment: PaymentRecord | null;
}

/** The online payment gateway; null while it is not connected (checkout then offers the QR code only). */
export interface GatewayInfo {
  key: string;
  name: string;
  /** Ways to pay it offers ("Visa", "JazzCash"…). */
  brands: string[];
  /** Sandbox / test gateway: no real money moves. */
  testMode: boolean;
}

export interface CheckoutConfig {
  price: number;
  currency: string;
  gateway: GatewayInfo | null;
  /** Time a buyer has to finish on the gateway's page. */
  orderMinutes: number;
}

/** "expired" = never finished on the gateway's page in time. */
export type CheckoutOrderStatus = 'created' | 'paid' | 'failed' | 'cancelled' | 'expired';

export interface CheckoutOrder {
  id: string;
  status: CheckoutOrderStatus;
  plan: string;
  amount: number;
  currency: string;
  provider: string;
  providerName: string;
  testMode: boolean;
  transactionId: string | null;
  failureReason: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

/** Body of the HTTP 402 returned when a free daily limit is reached. */
export interface LimitReached {
  code: 'LIMIT_REACHED';
  kind: UsageKind;
  limit: number;
  resetsAt: string;
  message: string;
}

export interface AdminStats {
  totalUsers: number;
  lifetimeUsers: number;
  pendingPayments: number;
  approvedPayments: number;
  revenue: number;
  currency: string;
  newUsers24h: number;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  plan: Plan;
  planActivatedAt: string | null;
  createdAt: string;
}
