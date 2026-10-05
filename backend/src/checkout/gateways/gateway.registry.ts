import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { siteUrlFrom } from '../../common/site-url.js';
import type { PaymentGateway } from './gateway.types.js';
import { MockGateway } from './mock.gateway.js';

/** Injection token for the active gateway (null while online payments are off). */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

interface GatewayContext {
  config: ConfigService;
  /** Public address of the site (first FRONTEND_URL), for pages and callbacks the gateway opens. */
  siteUrl: string;
}

/**
 * Every adapter, by its PAYMENT_GATEWAY value. To connect the real gateway: implement
 * PaymentGateway in a new file next to mock.gateway.ts (it reads its own credentials from
 * ConfigService), register it here and set PAYMENT_GATEWAY plus those credentials in the env.
 */
const GATEWAYS: Record<string, (context: GatewayContext) => PaymentGateway> = {
  mock: ({ config, siteUrl }) => {
    if ((config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'production') {
      throw new Error('the test gateway cannot run with NODE_ENV=production — it would let anyone unlock lifetime access for free');
    }
    return new MockGateway(siteUrl);
  },
};

export function createGateway(config: ConfigService, logger = new Logger('Checkout')): PaymentGateway | null {
  const key = (config.get<string>('PAYMENT_GATEWAY') ?? '').trim().toLowerCase();
  if (!key || key === 'off' || key === 'none') {
    logger.log('Online payment gateway is off (PAYMENT_GATEWAY not set); checkout offers the QR code only.');
    return null;
  }
  const factory = GATEWAYS[key];
  if (!factory) {
    logger.error(`PAYMENT_GATEWAY="${key}" is not a known gateway (available: ${Object.keys(GATEWAYS).join(', ')}). Online payments are off.`);
    return null;
  }
  try {
    const gateway = factory({ config, siteUrl: siteUrlFrom(config) });
    if (gateway.testMode) logger.warn(`Online payments use "${gateway.name}" in TEST mode — no real money is collected.`);
    else logger.log(`Online payments use ${gateway.name}.`);
    return gateway;
  } catch (error) {
    logger.error(`Online payments are off: ${(error as Error).message}`);
    return null;
  }
}
