import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  type RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public, type AuthUser } from '../common/auth/auth.decorators.js';
import { type CheckoutPage, CheckoutService } from './checkout.service.js';
import type { GatewayRequest } from './gateways/gateway.types.js';

function gatewayRequest(req: RawBodyRequest<Request>): GatewayRequest {
  return { query: req.query, body: req.body as unknown, headers: req.headers, rawBody: req.rawBody };
}

function send(res: Response, page: CheckoutPage): void {
  if ('redirect' in page) {
    res.redirect(303, page.redirect);
    return;
  }
  res.setHeader('Content-Security-Policy', page.csp);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(page.html);
}

/**
 * Online checkout. The buyer-facing routes after "pay" are public: the gateway sends the browser
 * back without our token (and in the Android app the payment runs in the phone's browser).
 * Order ids are random UUIDs, and everything that changes an order is verified with the gateway.
 */
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /** Price and the online gateway (null while it is off). */
  @Public()
  @Get('config')
  config() {
    return this.checkout.publicConfig();
  }

  /** Starts an online payment; the app then opens the returned payUrl. */
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('orders')
  create(@CurrentUser() user: AuthUser) {
    return this.checkout.create(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.status(id);
  }

  @Public()
  @Get('orders/:id/pay')
  async pay(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    send(res, await this.checkout.launch(id));
  }

  @Public()
  @Get('return/:provider')
  async returnGet(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    res.redirect(303, await this.checkout.handleReturn(provider, gatewayRequest(req)));
  }

  @Public()
  @Post('return/:provider')
  async returnPost(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    res.redirect(303, await this.checkout.handleReturn(provider, gatewayRequest(req)));
  }

  /** Server-to-server notifications; gateways retry until they get a 2xx. */
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post('webhook/:provider')
  async webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    await this.checkout.handleWebhook(provider, gatewayRequest(req));
    return { received: true };
  }

  /** Hosted page of the test gateway (PAYMENT_GATEWAY=mock). */
  @Public()
  @Get('mock/:id')
  async mockPage(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    send(res, await this.checkout.mockPage(id));
  }
}
