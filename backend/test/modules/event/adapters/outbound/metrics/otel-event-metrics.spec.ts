import { OtelEventMetrics } from '../../../../../../src/modules/event/adapters/outbound/metrics/otel-event-metrics.js';
import {
  createInMemoryMetrics,
  findMetric,
  sumPoints,
  type InMemoryMetrics,
} from '../../../../../utils/otel.js';

describe('OtelEventMetrics', () => {
  let otel: InMemoryMetrics;

  beforeEach(() => {
    otel = createInMemoryMetrics();
  });

  afterEach(async () => {
    await otel.shutdown();
  });

  it('eventCreated incrementa bilheteria.events.created sem labels', async () => {
    const metrics = new OtelEventMetrics(otel.meter);

    metrics.eventCreated();
    metrics.eventCreated();
    metrics.eventCreated();

    const counter = findMetric(
      await otel.collect(),
      'bilheteria.events.created',
    );
    expect(counter.descriptor.unit).toBe('{event}');
    expect(sumPoints(counter)).toEqual([{ attributes: {}, value: 3 }]);
  });
});
