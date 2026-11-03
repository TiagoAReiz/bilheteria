import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { EventSearchController } from '../../../../../../src/modules/event/adapters/inbound/controllers/event-search.controller.js';
import {
  EVENT_SEARCH_SERVICE,
  type EventSearchServicePort,
} from '../../../../../../src/modules/event/application/ports/inbound/services/event-search.service.port.js';
import type {
  SearchEventsDto,
  SuggestEventsDto,
} from '../../../../../../src/modules/event/adapters/dto/search-events-dto.js';

describe('EventSearchController', () => {
  let controller: EventSearchController;
  let service: MockPort<EventSearchServicePort>;
  const reflector = new Reflector();

  beforeEach(async () => {
    service = { searchEvents: vi.fn(), suggestEvents: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [EventSearchController],
      providers: [{ provide: EVENT_SEARCH_SERVICE, useValue: service }],
    }).compile();
    controller = module.get(EventSearchController);
  });

  it.each([
    ['search', 'search'],
    ['suggest', 'suggest'],
  ] as const)('%s é pública e mapeada em GET /events/%s', (method, path) => {
    const handler = handlerOf(EventSearchController, method);
    expect(Reflect.getMetadata(PATH_METADATA, EventSearchController)).toBe(
      'events',
    );
    expect(reflector.get('PUBLIC', handler)).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('search traduz a query para os critérios do caso de uso', async () => {
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-31T00:00:00.000Z');
    const result = {
      items: [],
      total: 0,
      page: 2,
      size: 10,
      facets: { locations: [] },
    };
    service.searchEvents.mockResolvedValue(result);

    await expect(
      controller.search({
        q: 'rock',
        location: 'Recife',
        from,
        to,
        available: true,
        page: 2,
        size: 10,
      } as SearchEventsDto),
    ).resolves.toBe(result);

    expect(service.searchEvents).toHaveBeenCalledWith({
      text: 'rock',
      location: 'Recife',
      from,
      to,
      onlyAvailable: true,
      page: 2,
      size: 10,
    });
  });

  it('available ausente significa não filtrar por disponibilidade', async () => {
    await controller.search({ page: 1, size: 12 } as SearchEventsDto);

    expect(service.searchEvents.mock.calls[0][0].onlyAvailable).toBe(false);
  });

  it('suggest delega o prefixo', async () => {
    service.suggestEvents.mockResolvedValue([]);
    await controller.suggest({ q: 'fes' } as SuggestEventsDto);
    expect(service.suggestEvents).toHaveBeenCalledWith('fes');
  });
});
