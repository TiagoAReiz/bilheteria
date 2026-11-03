import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { TicketSearchService } from '../../../../../src/modules/ticket/application/services/ticket-search.service.js';
import {
  TICKET_SEARCH,
  type TicketSearchPort,
} from '../../../../../src/modules/ticket/application/ports/outbound/search/ticket-search.port.js';
import {
  EVENT_SERVICE,
  type EventServicePort,
} from '../../../../../src/modules/event/application/ports/inbound/services/event.service.port.js';
import { Role } from '../../../../../src/modules/users/core/entities/role.js';
import type { TicketSearchResult } from '../../../../../src/modules/ticket/core/entities/ticket-search.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const admin = { id: 'admin-1', role: Role.ADMIN };
const organizer = { id: 'org-1', role: Role.ORGANIZER };
const filters = { page: 1, size: 20 };
const result: TicketSearchResult = { items: [], total: 0, page: 1, size: 20 };

describe('TicketSearchService', () => {
  let service: TicketSearchService;
  let ticketSearch: MockPort<TicketSearchPort>;
  let eventService: MockPort<EventServicePort>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);

    ticketSearch = { search: vi.fn().mockResolvedValue(result) };
    eventService = {
      createEvent: vi.fn(),
      listUpcomingEvents: vi.fn(),
      getEventById: vi.fn(),
      getEventDetail: vi.fn(),
      getEventIdsByOrganizer: vi.fn().mockResolvedValue([3, 8]),
    };

    const module = await Test.createTestingModule({
      providers: [
        TicketSearchService,
        { provide: TICKET_SEARCH, useValue: ticketSearch },
        { provide: EVENT_SERVICE, useValue: eventService },
      ],
    }).compile();
    service = module.get(TicketSearchService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ADMIN', () => {
    it('vê tudo, sem consultar a posse dos eventos', async () => {
      await expect(service.searchTickets(admin, filters)).resolves.toBe(result);

      expect(ticketSearch.search).toHaveBeenCalledWith(
        { eventIds: undefined, status: undefined, page: 1, size: 20 },
        NOW,
      );
      expect(eventService.getEventIdsByOrganizer).not.toHaveBeenCalled();
    });

    it('pode filtrar qualquer evento e status', async () => {
      await service.searchTickets(admin, {
        ...filters,
        eventId: 99,
        status: 'paid',
      });

      expect(ticketSearch.search).toHaveBeenCalledWith(
        { eventIds: [99], status: 'paid', page: 1, size: 20 },
        NOW,
      );
    });
  });

  describe('ORGANIZER', () => {
    it('só enxerga os próprios eventos (ids vindos do Postgres)', async () => {
      await service.searchTickets(organizer, {
        ...filters,
        status: 'reserved',
      });

      expect(eventService.getEventIdsByOrganizer).toHaveBeenCalledWith('org-1');
      expect(ticketSearch.search).toHaveBeenCalledWith(
        { eventIds: [3, 8], status: 'reserved', page: 1, size: 20 },
        NOW,
      );
    });

    it('filtrando um evento próprio, restringe só a ele', async () => {
      await service.searchTickets(organizer, { ...filters, eventId: 8 });

      expect(ticketSearch.search.mock.calls[0][0].eventIds).toEqual([8]);
    });

    it('evento de outro organizador é 403 e não consulta o índice', async () => {
      await expect(
        service.searchTickets(organizer, { ...filters, eventId: 99 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ticketSearch.search).not.toHaveBeenCalled();
    });

    it('sem eventos: resultado vazio sem ir ao Elasticsearch', async () => {
      eventService.getEventIdsByOrganizer.mockResolvedValue([]);

      await expect(
        service.searchTickets(organizer, { page: 2, size: 10 }),
      ).resolves.toEqual({ items: [], total: 0, page: 2, size: 10 });
      expect(ticketSearch.search).not.toHaveBeenCalled();
    });
  });
});
