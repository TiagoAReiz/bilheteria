import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { EventSearchService } from '../../../../../src/modules/event/application/services/event-search.service.js';
import {
  EVENT_SEARCH,
  type EventSearchPort,
} from '../../../../../src/modules/event/application/ports/outbound/search/event-search.port.js';
import type { EventSearchCriteria } from '../../../../../src/modules/event/core/entities/event-search.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const criteria: EventSearchCriteria = {
  onlyAvailable: false,
  page: 1,
  size: 12,
};

describe('EventSearchService', () => {
  let service: EventSearchService;
  let eventSearch: MockPort<EventSearchPort>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    eventSearch = { search: vi.fn(), suggest: vi.fn() };
    const module = await Test.createTestingModule({
      providers: [
        EventSearchService,
        { provide: EVENT_SEARCH, useValue: eventSearch },
      ],
    }).compile();
    service = module.get(EventSearchService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('searchEvents delega com o instante atual', async () => {
    const result = {
      items: [],
      total: 0,
      page: 1,
      size: 12,
      facets: { locations: [] },
    };
    eventSearch.search.mockResolvedValue(result);

    await expect(service.searchEvents(criteria)).resolves.toBe(result);
    expect(eventSearch.search).toHaveBeenCalledWith(criteria, NOW);
  });

  it('rejeita período invertido sem ir ao índice', async () => {
    await expect(
      service.searchEvents({
        ...criteria,
        from: new Date('2026-08-01'),
        to: new Date('2026-07-01'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventSearch.search).not.toHaveBeenCalled();
  });

  it('aceita período de um único instante', async () => {
    const day = new Date('2026-08-01');
    await service.searchEvents({ ...criteria, from: day, to: day });
    expect(eventSearch.search).toHaveBeenCalled();
  });

  it('suggestEvents pede no máximo 8 sugestões', async () => {
    eventSearch.suggest.mockResolvedValue([]);
    await service.suggestEvents('fes');
    expect(eventSearch.suggest).toHaveBeenCalledWith('fes', 8, NOW);
  });

  it('propaga o 503 do adapter', async () => {
    eventSearch.search.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.searchEvents(criteria)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
