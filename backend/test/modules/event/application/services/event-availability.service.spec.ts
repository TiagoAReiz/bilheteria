import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { EventAvailabilityService } from '../../../../../src/modules/event/application/services/event-availability.service.js';
import {
  EVENT_REPOSITORY,
  type EventRepositoryPort,
} from '../../../../../src/modules/event/application/ports/outbound/repositories/event.repository.port.js';
import { RESERVATION_TTL_MINUTES } from '../../../../../src/modules/ticket/core/entities/reservation.entity.js';

describe('EventAvailabilityService', () => {
  let service: EventAvailabilityService;
  let eventRepository: MockPort<EventRepositoryPort>;

  beforeEach(async () => {
    eventRepository = {
      createWithTickets: vi.fn(),
      getUpcomingEvents: vi.fn(),
      getEventById: vi.fn(),
      getEventWithPhotos: vi.fn(),
      getEventIdsByOrganizer: vi.fn(),
      refreshAvailableTickets: vi.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        EventAvailabilityService,
        { provide: EVENT_REPOSITORY, useValue: eventRepository },
      ],
    }).compile();
    service = module.get(EventAvailabilityService);
  });

  it('recalcula com o mesmo TTL da reserva e devolve quantos eventos mudaram', async () => {
    eventRepository.refreshAvailableTickets.mockResolvedValue(3);

    await expect(service.refreshAvailableTickets()).resolves.toBe(3);
    expect(eventRepository.refreshAvailableTickets).toHaveBeenCalledWith(
      RESERVATION_TTL_MINUTES,
    );
  });
});
