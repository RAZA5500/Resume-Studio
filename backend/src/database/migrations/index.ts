import { InitialSchema1790942400000 } from './1790942400000-InitialSchema.js';
import { CheckoutOrders1791158400000 } from './1791158400000-CheckoutOrders.js';
import { SessionVersion1791187200000 } from './1791187200000-SessionVersion.js';
import { SocialSignIn1791216000000 } from './1791216000000-SocialSignIn.js';
import { TwoFactor1791230400000 } from './1791230400000-TwoFactor.js';
import { EmailVerification1791237600000 } from './1791237600000-EmailVerification.js';

/**
 * Applied in order at startup (and by `npm run migration:run`). After `npm run migration:generate`,
 * add the new class at the end of this list.
 */
export const MIGRATIONS = [
  InitialSchema1790942400000,
  CheckoutOrders1791158400000,
  SessionVersion1791187200000,
  SocialSignIn1791216000000,
  TwoFactor1791230400000,
  EmailVerification1791237600000,
];
