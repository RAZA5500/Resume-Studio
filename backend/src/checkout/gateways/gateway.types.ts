/**
 * The contract every online payment gateway adapter implements. Checkout only talks to this
 * interface, so connecting the real gateway means adding one adapter file and its env settings —
 * orders, fulfilment, the payments ledger and the checkout pages stay as they are.
 */

/** A gateway's verdict about one order. "pending" means it has not settled yet. */
export type GatewayOutcome = 'paid' | 'failed' | 'cancelled' | 'pending';

/**
 * How the buyer's browser reaches the gateway's payment page: a plain redirect, or a form that has
 * to be POSTed (JazzCash, Easypaisa and PayFast style hosted checkouts work that way).
 */
export type GatewayAction =
  | { kind: 'redirect'; url: string }
  | { kind: 'form'; url: string; fields: Record<string, string> };

export interface GatewayOrder {
  /** Our order id (UUID); send it to the gateway as the merchant order / bill reference. */
  id: string;
  /** Whole currency units (PKR). */
  amount: number;
  currency: string;
  description: string;
  customer: { email: string; name: string };
  /** The gateway's own session id, when createSession returned one. */
  reference: string | null;
}

export interface CheckoutUrls {
  /** The gateway sends the buyer back here (GET or POST); the API verifies it, then opens the app. */
  returnUrl: string;
  /** Where the buyer lands after pressing cancel on the gateway's page. */
  cancelUrl: string;
  /** Server-to-server notification (IPN / webhook) address. */
  webhookUrl: string;
}

export interface GatewaySession {
  action: GatewayAction;
  /** The gateway's id for this payment session (tracker, token, checkout id…), if it issues one. */
  reference?: string;
}

/** Data the gateway sent, as received: query string, parsed body and the exact bytes it signed. */
export interface GatewayRequest {
  query: Record<string, unknown>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

/** A verified statement from the gateway about one order. */
export interface GatewayResult {
  orderId: string;
  outcome: GatewayOutcome;
  /** The gateway's transaction id; it becomes the payment's transaction ID in the ledger. */
  transactionId?: string;
  /** What was charged, in whole currency units — compared against the order before fulfilment. */
  amount?: number;
  currency?: string;
  /** Wallet number / masked card the buyer paid with, when the gateway reports it. */
  payer?: string;
  /** The gateway's reason for a failed or cancelled payment. */
  message?: string;
}

export interface PaymentGateway {
  /** Value of PAYMENT_GATEWAY that selects this adapter; also used in callback URLs. */
  readonly key: string;
  /** Shown to buyers ("Pay with …") and on the admin payments list. */
  readonly name: string;
  /** Ways to pay the gateway offers, shown as chips on the checkout ("Visa", "JazzCash"…). */
  readonly brands: string[];
  /** Sandbox / test credentials: the checkout says so, and no real money moves. */
  readonly testMode: boolean;

  /** Registers the payment with the gateway and says where to send the buyer. */
  createSession(order: GatewayOrder, urls: CheckoutUrls): Promise<GatewaySession>;
  /** Checks the data that comes back with the buyer. Returns null when it is not genuine. */
  verifyReturn(request: GatewayRequest): Promise<GatewayResult | null>;
  /** Checks a server-to-server notification. Returns null when it is not genuine. */
  verifyWebhook(request: GatewayRequest): Promise<GatewayResult | null>;
  /** Asks the gateway for the order's current state (optional: not every gateway has a status API). */
  fetchStatus?(order: GatewayOrder): Promise<GatewayResult | null>;
}

/** Reads one field from a parsed query string or form / JSON body. */
export function field(source: unknown, name: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const value = (source as Record<string, unknown>)[name];
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
}
