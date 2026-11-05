import { Inject, Injectable } from '@nestjs/common';
import type { Counter, Meter } from '@opentelemetry/api';
import {
  EmailMetricsPort,
  EmailOutcome,
} from '../../../application/ports/outbound/metrics/email-metrics.port.js';
import { EmailKind } from '../../../core/entities/email.js';
import { OTEL_METER } from '../../../../observability/adapters/outbound/otel/otel.providers.js';

// No Prometheus: bilheteria_emails_processed_total{kind, outcome}
@Injectable()
export class OtelEmailMetrics implements EmailMetricsPort {
  private readonly processed: Counter;

  constructor(@Inject(OTEL_METER) meter: Meter) {
    this.processed = meter.createCounter('bilheteria.emails.processed', {
      description:
        'Tentativas de envio de email da outbox, por tipo e resultado',
      unit: '{email}',
    });
  }

  emailProcessed(kind: EmailKind, outcome: EmailOutcome): void {
    this.processed.add(1, { kind, outcome });
  }
}
