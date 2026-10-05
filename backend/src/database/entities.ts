import { AtsReport } from '../ats/ats-report.entity.js';
import { Payment } from '../billing/payment.entity.js';
import { UsageEvent } from '../billing/usage-event.entity.js';
import { CheckoutOrder } from '../checkout/checkout-order.entity.js';
import { DocumentFile } from '../documents/document.entity.js';
import { Resume } from '../resumes/resume.entity.js';
import { Template } from '../templates/template.entity.js';
import { User } from '../users/user.entity.js';

/**
 * Every TypeORM entity. The Nest app and the migration CLI (data-source.ts) share this list, so a new
 * entity must be added here — and its table created in a migration (`npm run migration:generate`).
 */
export const ENTITIES = [User, Template, Resume, DocumentFile, UsageEvent, Payment, CheckoutOrder, AtsReport];
