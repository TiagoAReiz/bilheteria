import { OtelTicketMetrics } from '../../../../../../src/modules/ticket/adapters/outbound/metrics/otel-ticket-metrics.js';
import {
  createInMemoryMetrics,
  findMetric,
  histogramPoints,
  sumPoints,
  type InMemoryMetrics,
} from '../../../../../utils/otel.js';

// Nomes OTel; no Prometheus viram bilheteria_reservations_total,
// bilheteria_reservation_duration_seconds, bilheteria_payments_{confirmed,rejected}_total.
describe('OtelTicketMetrics', () => {
  let otel: InMemoryMetrics;
  let metrics: OtelTicketMetrics;

  beforeEach(() => {
    otel = createInMemoryMetrics();
    metrics = new OtelTicketMetrics(otel.meter);
  });

  afterEach(async () => {
    await otel.shutdown();
  });

  describe('reservationAttempted', () => {
    it('conta bilheteria.reservations por outcome', async () => {
      metrics.reservationAttempted('reserved', 10);
      metrics.reservationAttempted('reserved', 20);
      metrics.reservationAttempted('sold_out', 5);

      const counter = findMetric(
        await otel.collect(),
        'bilheteria.reservations',
      );
      expect(counter.descriptor.unit).toBe('{reservation}');
      expect(sumPoints(counter)).toHaveLength(2);
      expect(sumPoints(counter)).toEqual(
        expect.arrayContaining([
          { attributes: { outcome: 'reserved' }, value: 2 },
          { attributes: { outcome: 'sold_out' }, value: 1 },
        ]),
      );
    });

    it('registra a duração em segundos no histograma bilheteria.reservation.duration', async () => {
      metrics.reservationAttempted('limit_reached', 250);
      metrics.reservationAttempted('limit_reached', 750);

      const histogram = findMetric(
        await otel.collect(),
        'bilheteria.reservation.duration',
      );
      expect(histogram.descriptor.unit).toBe('s');
      expect(histogramPoints(histogram)).toEqual([
        { attributes: { outcome: 'limit_reached' }, count: 2, sum: 1 },
      ]);
    });

    it.each([
      'reserved',
      'limit_reached',
      'sold_out',
      'no_cpf',
      'event_started',
      'event_not_found',
    ] as const)(
      'usa o outcome %s como único label do counter e do histograma',
      async (outcome) => {
        metrics.reservationAttempted(outcome, 1);

        const collected = await otel.collect();
        for (const name of [
          'bilheteria.reservations',
          'bilheteria.reservation.duration',
        ]) {
          const points = findMetric(collected, name).dataPoints;
          expect(points).toHaveLength(1);
          expect(points[0].attributes).toEqual({ outcome });
        }
      },
    );
  });

  it('paymentConfirmed incrementa bilheteria.payments.confirmed sem labels', async () => {
    metrics.paymentConfirmed();
    metrics.paymentConfirmed();

    const counter = findMetric(
      await otel.collect(),
      'bilheteria.payments.confirmed',
    );
    expect(counter.descriptor.unit).toBe('{payment}');
    expect(sumPoints(counter)).toEqual([{ attributes: {}, value: 2 }]);
  });

  it('paymentRejected incrementa bilheteria.payments.rejected por reason', async () => {
    metrics.paymentRejected('expired');
    metrics.paymentRejected('wrong_owner');
    metrics.paymentRejected('expired');

    const counter = findMetric(
      await otel.collect(),
      'bilheteria.payments.rejected',
    );
    expect(sumPoints(counter)).toHaveLength(2);
    expect(sumPoints(counter)).toEqual(
      expect.arrayContaining([
        { attributes: { reason: 'expired' }, value: 2 },
        { attributes: { reason: 'wrong_owner' }, value: 1 },
      ]),
    );
  });
});
