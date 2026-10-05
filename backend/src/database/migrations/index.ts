import { InitialSchema1790942400000 } from './1790942400000-InitialSchema.js';
import { CheckoutOrders1791158400000 } from './1791158400000-CheckoutOrders.js';
import { SessionVersion1791187200000 } from './1791187200000-SessionVersion.js';

/**
 * Applied in order at startup (and by `npm run migration:run`). After `npm run migration:generate`,
 * add the new class at the end of this list.
 */
export const MIGRATIONS = [InitialSchema1790942400000, CheckoutOrders1791158400000, SessionVersion1791187200000];
