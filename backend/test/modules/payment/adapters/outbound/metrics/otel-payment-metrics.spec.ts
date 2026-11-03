import { OtelPaymentMetrics } from '../../../../../../src/modules/payment/adapters/outbound/metrics/otel-payment-metrics.js';
import {
  createInMemoryMetrics,
  findMetric,
  sumPoints,
  type InMemoryMetrics,
} from '../../../../../utils/otel.js';

// Nomes OTel; no Prometheus: bilheteria_payments_{confirmed,rejected,refunded,not_approved,checkouts}_total
// e bilheteria_payments_webhooks_rejected_total. confirmed/rejected mantêm os nomes de antes do módulo.
describe('OtelPaymentMetrics', () => {
  let otel: InMemoryMetrics;
  let metrics: OtelPaymentMetrics;

  beforeEach(() => {
    otel = createInMemoryMetrics();
    metrics = new OtelPaymentMetrics(otel.meter);
  });

  afterEach(async () => {
    await otel.shutdown();
  });

  it('paymentConfirmed: bilheteria.payments.confirmed sem labels (mesmo nome de antes)', async () => {
    metrics.paymentConfirmed();
    metrics.paymentConfirmed();

    const counter = findMetric(await otel.collect(), 'bilheteria.payments.confirmed');
    expect(counter.descriptor.unit).toBe('{payment}');
    expect(sumPoints(counter)).toEqual([{ attributes: {}, value: 2 }]);
  });

  it('paymentRejected: bilheteria.payments.rejected por reason (mesmo nome de antes)', async () => {
    metrics.paymentRejected('expired');
    metrics.paymentRejected('wrong_owner');
    metrics.paymentRejected('expired');

    expect(sumPoints(findMetric(await otel.collect(), 'bilheteria.payments.rejected'))).toEqual(
      expect.arrayContaining([
        { attributes: { reason: 'expired' }, value: 2 },
        { attributes: { reason: 'wrong_owner' }, value: 1 },
      ]),
    );
  });

  it.each([
    ['paymentRefunded', 'bilheteria.payments.refunded', 'already_paid', { reason: 'already_paid' }],
    ['paymentNotApproved', 'bilheteria.payments.not_approved', 'rejected', { status: 'rejected' }],
    ['checkoutOpened', 'bilheteria.payments.checkouts', 'reused', { outcome: 'reused' }],
    ['webhookRejected', 'bilheteria.payments.webhooks.rejected', 'invalid_signature', { reason: 'invalid_signature' }],
  ] as const)('%s incrementa %s com um único label de baixa cardinalidade', async (method, name, value, attributes) => {
    (metrics[method] as (v: string) => void)(value);

    const points = sumPoints(findMetric(await otel.collect(), name));
    expect(points).toEqual([{ attributes, value: 1 }]);
  });
});
