import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity.js';
import { AdminGuard } from './admin.guard.js';
import { BillingConfigService } from './billing-config.service.js';
import { AdminController, BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { Payment } from './payment.entity.js';
import { UsageEvent } from './usage-event.entity.js';
import { UsageService } from './usage.service.js';

/** Global so resumes, AI and documents can enforce free-plan limits without extra imports. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UsageEvent, Payment, User])],
  controllers: [BillingController, AdminController],
  providers: [BillingConfigService, UsageService, BillingService, AdminGuard],
  exports: [BillingConfigService, UsageService],
})
export class BillingModule {}
