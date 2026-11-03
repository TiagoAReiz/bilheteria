import type { Mock } from 'vitest';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { errors, type Client } from '@elastic/elasticsearch';
import {
  ElasticsearchTicketSearch,
  type TicketDocument,
} from '../../../../../../src/modules/ticket/adapters/outbound/search/elasticsearch-ticket-search.js';
import type { TicketSearchCriteria } from '../../../../../../src/modules/ticket/core/entities/ticket-search.entity.js';
import { RESERVATION_TTL_MINUTES } from '../../../../../../src/modules/ticket/core/entities/reservation.entity.js';
import { responseError } from '../../../../../utils/elasticsearch.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const CUTOFF = new Date(
  NOW.getTime() - RESERVATION_TTL_MINUTES * 60 * 1000,
).toISOString();

const criteria = (
  overrides: Partial<TicketSearchCriteria> = {},
): TicketSearchCriteria => ({ page: 1, size: 20, ...overrides });

const doc = (overrides: Partial<TicketDocument> = {}): TicketDocument => ({
  id: 1,
  event_id: 10,
  user_id: null,
  status: 'available',
  reserved_at: null,
  is_paid: false,
  deleted: false,
  ...overrides,
});

const response = (docs: TicketDocument[], total = docs.length) => ({
  hits: {
    total: { value: total, relation: 'eq' },
    hits: docs.map((source) => ({ _id: String(source.id), _source: source })),
  },
});

describe('ElasticsearchTicketSearch', () => {
  let client: { search: Mock };
  let adapter: ElasticsearchTicketSearch;

  beforeEach(() => {
    client = { search: vi.fn().mockResolvedValue(response([])) };
    adapter = new ElasticsearchTicketSearch(client as unknown as Client);
  });

  const request = () => client.search.mock.calls[0][0];

  it('sem filtros (ADMIN): só exclui deletados, paginado e ordenado', async () => {
    await adapter.search(criteria({ page: 2, size: 50 }), NOW);

    expect(request()).toEqual({
      index: 'tickets',
      from: 50,
      size: 50,
      track_total_hits: true,
      query: { bool: { filter: [{ term: { deleted: false } }] } },
      sort: [{ event_id: 'asc' }, { id: 'asc' }],
    });
  });

  it('restringe aos eventos informados', async () => {
    await adapter.search(criteria({ eventIds: [3, 8] }), NOW);

    expect(request().query.bool.filter).toEqual([
      { term: { deleted: false } },
      { terms: { event_id: [3, 8] } },
    ]);
  });

  it.each([
    ['available', [{ term: { status: 'available' } }]],
    ['paid', [{ term: { status: 'paid' } }]],
    [
      'reserved',
      [
        { term: { status: 'reserved' } },
        { range: { reserved_at: { gte: CUTOFF } } },
      ],
    ],
    [
      'expired',
      [
        { term: { status: 'reserved' } },
        { range: { reserved_at: { lt: CUTOFF } } },
      ],
    ],
  ] as const)('status %s', async (status, expected) => {
    await adapter.search(criteria({ status }), NOW);

    expect(request().query.bool.filter.slice(1)).toEqual(expected);
  });

  it('deriva "expired" na leitura e mapeia o resultado', async () => {
    const expiredAt = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString();
    const recentAt = new Date(NOW.getTime() - 60 * 1000).toISOString();
    client.search.mockResolvedValue(
      response(
        [
          doc({
            id: 1,
            status: 'reserved',
            user_id: 'u1',
            reserved_at: expiredAt,
          }),
          doc({
            id: 2,
            status: 'reserved',
            user_id: 'u2',
            reserved_at: recentAt,
          }),
          doc({
            id: 3,
            status: 'paid',
            user_id: 'u3',
            reserved_at: expiredAt,
            is_paid: true,
          }),
        ],
        3,
      ),
    );

    const result = await adapter.search(criteria(), NOW);

    expect(result.total).toBe(3);
    expect(result.items.map((t) => t.status)).toEqual([
      'expired',
      'reserved',
      'paid',
    ]);
    expect(result.items[0]).toEqual({
      id: 1,
      event_id: 10,
      user_id: 'u1',
      status: 'expired',
      reserved_at: new Date(expiredAt),
      is_paid: false,
    });
  });

  it('Elasticsearch fora vira 503', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    client.search.mockRejectedValue(
      new errors.NoLivingConnectionsError('none', {} as never),
    );

    await expect(adapter.search(criteria(), NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    vi.restoreAllMocks();
  });

  it('erro de requisição segue como está', async () => {
    const error = responseError(400);
    client.search.mockRejectedValue(error);

    await expect(adapter.search(criteria(), NOW)).rejects.toBe(error);
  });
});
