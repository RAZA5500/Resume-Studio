import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/auth.decorators.js';
import { OAuthExchangeDto } from '../dto/auth.dto.js';
import { type OAuthOutcome, OAuthService } from './oauth.service.js';

/** Sign in with Google / Apple. All routes are public: the person is not signed in yet. */
@Controller('auth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  /** Which provider buttons to show. */
  @Public()
  @Get('providers')
  providers() {
    return this.oauth.enabled();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oauth/:provider/start')
  start(
    @Param('provider') provider: string,
    @Query('client') client: string,
    @Query('challenge') challenge: string,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, this.oauth.start(provider, client, challenge));
  }

  /** Google returns with a query string. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('oauth/:provider/callback')
  async callback(@Param('provider') provider: string, @Query() query: Record<string, unknown>, @Ip() ip: string, @Res() res: Response) {
    this.finish(res, await this.oauth.callback(provider, query, ip));
  }

  /** Apple posts a form back (response_mode=form_post). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('oauth/:provider/callback')
  async callbackPost(@Param('provider') provider: string, @Req() req: Request, @Ip() ip: string, @Res() res: Response) {
    const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? (req.body as Record<string, unknown>) : {};
    this.finish(res, await this.oauth.callback(provider, body, ip));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('oauth/exchange')
  exchange(@Body() dto: OAuthExchangeDto) {
    return this.oauth.exchange(dto.code, dto.verifier, dto.devices);
  }

  private finish(res: Response, outcome: OAuthOutcome): void {
    res.setHeader('Cache-Control', 'no-store');
    if (outcome.client === 'app') {
      const page = this.oauth.appPage(outcome);
      res.setHeader('Content-Security-Policy', page.csp);
      res.type('html').send(page.html);
      return;
    }
    res.redirect(303, this.oauth.webUrl(outcome));
  }
}
