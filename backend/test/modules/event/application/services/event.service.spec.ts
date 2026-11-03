import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { EventService } from '../../../../../src/modules/event/application/services/event.service.js';
import {
  EVENT_REPOSITORY,
  type EventRepositoryPort,
} from '../../../../../src/modules/event/application/ports/outbound/repositories/event.repository.port.js';
import {
  EVENT_METRICS,
  type EventMetricsPort,
} from '../../../../../src/modules/event/application/ports/outbound/metrics/event-metrics.port.js';
import type { Event } from '../../../../../src/modules/event/core/entities/event.entity.js';
import type { NewEvent } from '../../../../../src/modules/event/core/entities/new-event.entity.js';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date('2030-01-01T20:00:00Z'),
  capacity: 10,
  price_cents: 5000,
  available_tickets: 10,
  organizer_id: 'org-1',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
  ...overrides,
});

describe('EventService', () => {
  let service: EventService;
  let eventRepository: MockPort<EventRepositoryPort>;
  let metrics: MockPort<EventMetricsPort>;

  beforeEach(async () => {
    eventRepository = {
      createWithTickets: vi.fn(),
      getUpcomingEvents: vi.fn(),
      getEventById: vi.fn(),
      getEventIdsByOrganizer: vi.fn(),
      refreshAvailableTickets: vi.fn(),
    };
    metrics = { eventCreated: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: EVENT_REPOSITORY, useValue: eventRepository },
        { provide: EVENT_METRICS, useValue: metrics },
      ],
    }).compile();

    service = module.get(EventService);
  });

  it('createEvent delega para createWithTickets e retorna o evento criado', async () => {
    const input: NewEvent = {
      name: 'Show',
      location: 'Arena',
      starts_at: new Date('2030-01-01T20:00:00Z'),
      capacity: 10,
      price_cents: 5000,
      organizer_id: 'org-1',
    };
    const created = makeEvent();
    eventRepository.createWithTickets.mockResolvedValue(created);

    await expect(service.createEvent(input)).resolves.toBe(created);
    expect(eventRepository.createWithTickets).toHaveBeenCalledWith(input);
    expect(metrics.eventCreated).toHaveBeenCalledTimes(1);
  });

  it('createEvent não conta evento criado quando o repositório falha', async () => {
    eventRepository.createWithTickets.mockRejectedValue(new Error('db'));

    await expect(
      service.createEvent({
        name: 'Show',
        location: 'Arena',
        starts_at: new Date('2030-01-01T20:00:00Z'),
        capacity: 10,
        price_cents: 5000,
        organizer_id: 'org-1',
      }),
    ).rejects.toThrow('db');
    expect(metrics.eventCreated).not.toHaveBeenCalled();
  });

  it('leituras não geram métrica de evento criado', async () => {
    eventRepository.getUpcomingEvents.mockResolvedValue([]);
    eventRepository.getEventById.mockResolvedValue(makeEvent());

    await service.listUpcomingEvents();
    await service.getEventById(1);

    expect(metrics.eventCreated).not.toHaveBeenCalled();
  });

  it('listUpcomingEvents delega para getUpcomingEvents', async () => {
    const events = [makeEvent(), makeEvent({ id: 2 })];
    eventRepository.getUpcomingEvents.mockResolvedValue(events);

    await expect(service.listUpcomingEvents()).resolves.toBe(events);
    expect(eventRepository.getUpcomingEvents).toHaveBeenCalledTimes(1);
  });

  it('getEventById delega para o repositório com o id', async () => {
    const event = makeEvent({ id: 7 });
    eventRepository.getEventById.mockResolvedValue(event);

    await expect(service.getEventById(7)).resolves.toBe(event);
    expect(eventRepository.getEventById).toHaveBeenCalledWith(7);
  });

  it('getEventById propaga o NotFound do repositório', async () => {
    eventRepository.getEventById.mockRejectedValue(new NotFoundException());
    await expect(service.getEventById(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getEventIdsByOrganizer delega para o repositório', async () => {
    eventRepository.getEventIdsByOrganizer.mockResolvedValue([1, 4]);

    await expect(service.getEventIdsByOrganizer('org-1')).resolves.toEqual([
      1, 4,
    ]);
    expect(eventRepository.getEventIdsByOrganizer).toHaveBeenCalledWith(
      'org-1',
    );
  });
});
