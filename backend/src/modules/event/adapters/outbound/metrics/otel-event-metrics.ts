import { Inject, Injectable } from '@nestjs/common';
import type { Counter, Meter } from '@opentelemetry/api';
import { EventMetricsPort } from '../../../application/ports/outbound/metrics/event-metrics.port.js';
import { OTEL_METER } from '../../../../observability/adapters/outbound/otel/otel.providers.js';

// No Prometheus: bilheteria.events.created -> bilheteria_events_created_total
@Injectable()
export class OtelEventMetrics implements EventMetricsPort {
  private readonly eventsCreated: Counter;

  constructor(@Inject(OTEL_METER) meter: Meter) {
    this.eventsCreated = meter.createCounter('bilheteria.events.created', {
      description: 'Eventos criados (com os ingressos gerados)',
      unit: '{event}',
    });
  }

  eventCreated(): void {
    this.eventsCreated.add(1);
  }
}
