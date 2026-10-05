import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity.js';
import { CheckoutOrder } from './checkout-order.entity.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { createGateway, PAYMENT_GATEWAY } from './gateways/gateway.registry.js';

/** Online checkout (payment gateway). Prices and the payments ledger come from BillingModule. */
@Module({
  imports: [TypeOrmModule.forFeature([CheckoutOrder, User])],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    { provide: PAYMENT_GATEWAY, inject: [ConfigService], useFactory: (config: ConfigService) => createGateway(config) },
  ],
})
export class CheckoutModule {}
