import { OtelStorageMetrics } from '../../../../../../src/modules/storage/adapters/outbound/metrics/otel-storage-metrics.js';
import {
  createInMemoryMetrics,
  findMetric,
  sumPoints,
  type InMemoryMetrics,
} from '../../../../../utils/otel.js';

// No Prometheus: bilheteria_images_{upload_urls,uploads_confirmed,uploads_rejected,delete_failures}_total
describe('OtelStorageMetrics', () => {
  let otel: InMemoryMetrics;
  let metrics: OtelStorageMetrics;

  beforeEach(() => {
    otel = createInMemoryMetrics();
    metrics = new OtelStorageMetrics(otel.meter);
  });

  afterEach(async () => {
    await otel.shutdown();
  });

  it('uploadUrlIssued: bilheteria.images.upload_urls por kind', async () => {
    metrics.uploadUrlIssued('event_cover');
    metrics.uploadUrlIssued('event_cover');
    metrics.uploadUrlIssued('user_avatar');

    const counter = findMetric(
      await otel.collect(),
      'bilheteria.images.upload_urls',
    );
    expect(counter.descriptor.unit).toBe('{url}');
    expect(sumPoints(counter)).toEqual(
      expect.arrayContaining([
        { attributes: { kind: 'event_cover' }, value: 2 },
        { attributes: { kind: 'user_avatar' }, value: 1 },
      ]),
    );
  });

  it('uploadConfirmed e objectDeleteFailed por kind', async () => {
    metrics.uploadConfirmed('event_photo');
    metrics.objectDeleteFailed('event_photo');

    const collected = await otel.collect();
    expect(
      sumPoints(findMetric(collected, 'bilheteria.images.uploads.confirmed')),
    ).toEqual([{ attributes: { kind: 'event_photo' }, value: 1 }]);
    expect(
      sumPoints(findMetric(collected, 'bilheteria.images.delete_failures')),
    ).toEqual([{ attributes: { kind: 'event_photo' }, value: 1 }]);
  });

  it('uploadRejected por kind e reason', async () => {
    metrics.uploadRejected('user_avatar', 'too_large');
    metrics.uploadRejected('user_avatar', 'invalid_key');

    expect(
      sumPoints(
        findMetric(await otel.collect(), 'bilheteria.images.uploads.rejected'),
      ),
    ).toEqual(
      expect.arrayContaining([
        { attributes: { kind: 'user_avatar', reason: 'too_large' }, value: 1 },
        {
          attributes: { kind: 'user_avatar', reason: 'invalid_key' },
          value: 1,
        },
      ]),
    );
  });
});
