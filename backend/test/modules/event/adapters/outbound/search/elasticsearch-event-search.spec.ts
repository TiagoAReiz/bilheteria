import type { Mock } from 'vitest';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { errors, type Client } from '@elastic/elasticsearch';
import {
  ElasticsearchEventSearch,
  type EventDocument,
} from '../../../../../../src/modules/event/adapters/outbound/search/elasticsearch-event-search.js';
import type { EventSearchCriteria } from '../../../../../../src/modules/event/core/entities/event-search.entity.js';
import { SEARCH_UNAVAILABLE_MESSAGE } from '../../../../../../src/modules/search/search-availability.js';
import { responseError } from '../../../../../utils/elasticsearch.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const criteria = (
  overrides: Partial<EventSearchCriteria> = {},
): EventSearchCriteria => ({
  onlyAvailable: false,
  page: 1,
  size: 12,
  ...overrides,
});

const doc = (overrides: Partial<EventDocument> = {}): EventDocument => ({
  id: 1,
  name: 'Festival de Jazz',
  name_stemmed: 'Festival de Jazz',
  description: 'Noite de jazz',
  location: 'São Paulo',
  starts_at: '2026-07-01T20:00:00.000Z',
  capacity: 100,
  available_tickets: 40,
  organizer_id: 'org-1',
  deleted: false,
  ...overrides,
});

const searchResponse = (
  docs: EventDocument[],
  total: number | { value: number; relation: string } = docs.length,
  buckets: { key: string; doc_count: number }[] = [],
) => ({
  hits: {
    total,
    hits: docs.map((source) => ({ _id: String(source.id), _source: source })),
  },
  aggregations: { locations: { buckets } },
});

const visibleFilters = [
  { term: { deleted: false } },
  { range: { starts_at: { gt: NOW.toISOString() } } },
];

describe('ElasticsearchEventSearch', () => {
  let client: { search: Mock };
  let adapter: ElasticsearchEventSearch;

  beforeEach(() => {
    client = { search: vi.fn() };
    adapter = new ElasticsearchEventSearch(client as unknown as Client);
  });

  const request = () => client.search.mock.calls[0][0];

  describe('search', () => {
    it('sem texto: match_all, só eventos futuros e não excluídos, ordenados por data', async () => {
      client.search.mockResolvedValue(searchResponse([]));

      await adapter.search(criteria(), NOW);

      expect(request()).toEqual({
        index: 'events',
        from: 0,
        size: 12,
        track_total_hits: true,
        query: { bool: { must: [{ match_all: {} }], filter: visibleFilters } },
        aggs: {
          locations: { terms: { field: 'location.keyword', size: 20 } },
        },
        sort: [{ starts_at: 'asc' }],
      });
    });

    it('com texto: multi_match com fuzziness e boost no nome, ordenado por relevância', async () => {
      client.search.mockResolvedValue(searchResponse([]));

      await adapter.search(criteria({ text: 'jaz' }), NOW);

      expect(request().query.bool.must).toEqual([
        {
          multi_match: {
            query: 'jaz',
            fields: ['name^3', 'name_stemmed^3', 'location^2', 'description'],
            fuzziness: 'AUTO',
            prefix_length: 1,
          },
        },
      ]);
      expect(request().sort).toEqual(['_score', { starts_at: 'asc' }]);
    });

    it('aplica período, disponibilidade e local (este como post_filter para a faceta)', async () => {
      client.search.mockResolvedValue(searchResponse([]));
      const from = new Date('2026-07-01T00:00:00.000Z');
      const to = new Date('2026-07-31T23:59:59.000Z');

      await adapter.search(
        criteria({ from, to, onlyAvailable: true, location: 'São Paulo' }),
        NOW,
      );

      expect(request().query.bool.filter).toEqual([
        ...visibleFilters,
        {
          range: {
            starts_at: { gte: from.toISOString(), lte: to.toISOString() },
          },
        },
        { range: { available_tickets: { gt: 0 } } },
      ]);
      expect(request().post_filter).toEqual({
        term: { 'location.keyword': 'São Paulo' },
      });
    });

    it('aceita só um dos limites de data', async () => {
      client.search.mockResolvedValue(searchResponse([]));
      const to = new Date('2026-07-31T00:00:00.000Z');

      await adapter.search(criteria({ to }), NOW);

      expect(request().query.bool.filter).toContainEqual({
        range: { starts_at: { lte: to.toISOString() } },
      });
    });

    it('calcula o deslocamento da página', async () => {
      client.search.mockResolvedValue(searchResponse([]));

      await adapter.search(criteria({ page: 3, size: 10 }), NOW);

      expect(request()).toMatchObject({ from: 20, size: 10 });
    });

    it('mapeia itens, total e facetas', async () => {
      client.search.mockResolvedValue(
        searchResponse([doc()], { value: 57, relation: 'eq' }, [
          { key: 'São Paulo', doc_count: 40 },
          { key: 'Rio de Janeiro', doc_count: 17 },
        ]),
      );

      await expect(adapter.search(criteria(), NOW)).resolves.toEqual({
        items: [
          {
            id: 1,
            name: 'Festival de Jazz',
            description: 'Noite de jazz',
            location: 'São Paulo',
            starts_at: new Date('2026-07-01T20:00:00.000Z'),
            capacity: 100,
            available_tickets: 40,
            cover_key: null,
          },
        ],
        total: 57,
        page: 1,
        size: 12,
        facets: {
          locations: [
            { value: 'São Paulo', count: 40 },
            { value: 'Rio de Janeiro', count: 17 },
          ],
        },
      });
    });

    it('não expõe campos internos do documento (organizer_id, deleted, name_stemmed)', async () => {
      client.search.mockResolvedValue(searchResponse([doc()]));

      const { items } = await adapter.search(criteria(), NOW);

      expect(items[0]).not.toHaveProperty('organizer_id');
      expect(items[0]).not.toHaveProperty('deleted');
      expect(items[0]).not.toHaveProperty('name_stemmed');
    });

    it('tolera resposta sem agregação', async () => {
      client.search.mockResolvedValue({ hits: { total: 0, hits: [] } });

      await expect(adapter.search(criteria(), NOW)).resolves.toMatchObject({
        total: 0,
        facets: { locations: [] },
      });
    });
  });

  describe('suggest', () => {
    it('usa bool_prefix nos subcampos do search_as_you_type com os mesmos filtros de visibilidade', async () => {
      client.search.mockResolvedValue(searchResponse([]));

      await adapter.suggest('fest', 8, NOW);

      expect(request()).toEqual({
        index: 'events',
        size: 8,
        _source: ['id', 'name', 'location', 'starts_at'],
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: 'fest',
                  type: 'bool_prefix',
                  fields: ['name', 'name._2gram', 'name._3gram'],
                },
              },
            ],
            filter: visibleFilters,
          },
        },
      });
    });

    it('mapeia as sugestões', async () => {
      client.search.mockResolvedValue(searchResponse([doc({ id: 9 })]));

      await expect(adapter.suggest('fest', 8, NOW)).resolves.toEqual([
        {
          id: 9,
          name: 'Festival de Jazz',
          location: 'São Paulo',
          starts_at: new Date('2026-07-01T20:00:00.000Z'),
        },
      ]);
    });
  });

  describe('Elasticsearch indisponível', () => {
    let warn: Mock;

    beforeEach(() => {
      warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined) as unknown as Mock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['conexão recusada', new errors.ConnectionError('connect ECONNREFUSED')],
      ['timeout', new errors.TimeoutError('Request timed out')],
      ['cluster com erro 503', responseError(503)],
      [
        'índice ainda não criado',
        responseError(404, 'index_not_found_exception'),
      ],
    ])('%s vira 503', async (_case, error) => {
      client.search.mockRejectedValue(error);

      const promise = adapter.search(criteria(), NOW);
      await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(promise).rejects.toThrow(SEARCH_UNAVAILABLE_MESSAGE);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('suggest também vira 503', async () => {
      client.search.mockRejectedValue(new errors.ConnectionError('down'));

      await expect(adapter.suggest('x', 8, NOW)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('erro de requisição (400) não é mascarado como indisponibilidade', async () => {
      const error = responseError(400, 'parsing_exception');
      client.search.mockRejectedValue(error);

      await expect(adapter.search(criteria(), NOW)).rejects.toBe(error);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
