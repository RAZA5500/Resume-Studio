import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, type AuthUser } from '../common/auth/auth.decorators.js';
import { AdminGuard } from './admin.guard.js';
import { BillingService } from './billing.service.js';
import { ListPaymentsQueryDto, ListUsersQueryDto, ReviewPaymentDto, SetPlanDto, SubmitPaymentDto } from './dto/billing.dto.js';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Price, payment accounts and free-plan limits (shown on the pricing page). */
  @Public()
  @Get('config')
  config() {
    return this.billing.publicConfig();
  }

  /** Current plan, today's usage and the latest payment. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.billing.me(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('payments')
  @UseInterceptors(FileInterceptor('screenshot', { limits: { fileSize: 6 * 1024 * 1024 } }))
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitPaymentDto, @UploadedFile() screenshot?: Express.Multer.File) {
    return this.billing.submit(user.id, dto, screenshot);
  }
}

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly billing: BillingService) {}

  @Get('stats')
  stats() {
    return this.billing.stats();
  }

  @Get('payments')
  payments(@Query() query: ListPaymentsQueryDto) {
    return this.billing.listPayments(query.status ?? 'pending');
  }

  @Get('payments/:id/screenshot')
  async screenshot(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, type } = await this.billing.screenshot(id);
    return new StreamableFile(buffer, { type, disposition: 'inline' });
  }

  @HttpCode(200)
  @Post('payments/:id/approve')
  approve(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewPaymentDto) {
    return this.billing.approve(id, admin.email, dto.note);
  }

  @HttpCode(200)
  @Post('payments/:id/reject')
  reject(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewPaymentDto) {
    return this.billing.reject(id, admin.email, dto.note);
  }

  @Get('users')
  users(@Query() query: ListUsersQueryDto) {
    return this.billing.listUsers(query.search);
  }

  @HttpCode(200)
  @Post('users/:id/plan')
  setPlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPlanDto) {
    return this.billing.setPlan(id, dto.plan);
  }
}
