import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

/** Global: the auth guard and email verification both need to know whether email is on. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
