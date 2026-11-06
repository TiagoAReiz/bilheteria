import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { EmailDispatchService } from './application/services/email-dispatch.service.js';
import { EmailOutboxRepository } from './adapters/outbound/repositories/email-outbox.repository.js';
import { ReactEmailRenderer } from './adapters/outbound/renderers/react-email-renderer.js';
import { OtelEmailMetrics } from './adapters/outbound/metrics/otel-email-metrics.js';
import { ResendEmailSender } from './adapters/outbound/senders/resend-email-sender.js';
import { EmailOutboxScheduler } from './adapters/inbound/schedulers/email-outbox.scheduler.js';
import { EMAIL_DISPATCH_SERVICE } from './application/ports/inbound/services/email-dispatch.service.port.js';
import { EMAIL_OUTBOX_REPOSITORY } from './application/ports/outbound/repositories/email-outbox.repository.port.js';
import { EMAIL_RENDERER } from './application/ports/outbound/renderers/email-renderer.port.js';
import { EMAIL_SENDER } from './application/ports/outbound/senders/email-sender.port.js';
import { EMAIL_METRICS } from './application/ports/outbound/metrics/email-metrics.port.js';

/**
 * Emails transacionais. Os outros módulos não importam este: eles só gravam na outbox com
 * `enqueueEmail(tx, ...)` dentro da própria transação; o worker daqui envia depois.
 */
@Module({
  providers: [
    { provide: EMAIL_DISPATCH_SERVICE, useClass: EmailDispatchService },
    { provide: EMAIL_OUTBOX_REPOSITORY, useClass: EmailOutboxRepository },
    { provide: EMAIL_RENDERER, useClass: ReactEmailRenderer },
    { provide: EMAIL_METRICS, useClass: OtelEmailMetrics },
    {
      provide: EMAIL_SENDER,
      useFactory: (config: ConfigService) =>
        ResendEmailSender.fromConfig(config),
      inject: [ConfigService],
    },
    EmailOutboxScheduler,
  ],
  imports: [PrismaModule, ObservabilityModule],
})
export class NotificationModule {}
