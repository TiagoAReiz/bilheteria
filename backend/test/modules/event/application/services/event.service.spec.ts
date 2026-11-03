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
import { IMAGE_STORAGE_SERVICE } from '../../../../../src/modules/storage/application/ports/inbound/services/image-storage.service.port.js';
import { mockImageStorage, PUBLIC_BASE } from '../../../../utils/image-storage.js';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date('2030-01-01T20:00:00Z'),
  capacity: 10,
  price_cents: 5000,
  max_tickets_per_cpf: 2,
  available_tickets: 10,
  cover_key: null,
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
  let images: ReturnType<typeof mockImageStorage>;

  beforeEach(async () => {
    eventRepository = {
      createWithTickets: vi.fn(),
      getUpcomingEvents: vi.fn(),
      getEventById: vi.fn(),
      getEventWithPhotos: vi.fn(),
      getEventIdsByOrganizer: vi.fn(),
      refreshAvailableTickets: vi.fn(),
    };
    metrics = { eventCreated: vi.fn() };
    images = mockImageStorage();

    const module = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: EVENT_REPOSITORY, useValue: eventRepository },
        { provide: EVENT_METRICS, useValue: metrics },
        { provide: IMAGE_STORAGE_SERVICE, useValue: images },
      ],
    }).compile();

    service = module.get(EventService);
  });

  it('createEvent delega para createWithTickets e retorna o evento criado (sem capa ainda)', async () => {
    const input: NewEvent = {
      name: 'Show',
      location: 'Arena',
      starts_at: new Date('2030-01-01T20:00:00Z'),
      capacity: 10,
      price_cents: 5000,
      max_tickets_per_cpf: 2,
      organizer_id: 'org-1',
    };
    const created = makeEvent();
    eventRepository.createWithTickets.mockResolvedValue(created);

    const { cover_key: _cover, ...rest } = created;
    await expect(service.createEvent(input)).resolves.toEqual({ ...rest, cover_url: null });
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
        max_tickets_per_cpf: 2,
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

  it('listUpcomingEvents troca a chave da capa pela URL pública', async () => {
    const events = [makeEvent(), makeEvent({ id: 2, cover_key: 'events/2/cover/a.png' })];
    eventRepository.getUpcomingEvents.mockResolvedValue(events);

    const listed = await service.listUpcomingEvents();
    expect(listed.map((e) => e.cover_url)).toEqual([
      null,
      `${PUBLIC_BASE}/events/2/cover/a.png`,
    ]);
    expect(listed[1]).not.toHaveProperty('cover_key');
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

  it('getEventDetail monta capa e galeria (em ordem) com URLs públicas', async () => {
    eventRepository.getEventWithPhotos.mockResolvedValue(
      Object.assign(makeEvent({ id: 3, cover_key: 'events/3/cover/c.webp' }), {
      photos: [
        { id: 9, event_id: 3, key: 'events/3/photos/b.png', position: 1, created_at: new Date() },
        { id: 7, event_id: 3, key: 'events/3/photos/a.jpg', position: 0, created_at: new Date() },
      ],
      }),
    );

    const detail = await service.getEventDetail(3);

    expect(eventRepository.getEventWithPhotos).toHaveBeenCalledWith(3);
    expect(detail.cover_url).toBe(`${PUBLIC_BASE}/events/3/cover/c.webp`);
    expect(detail.photos).toEqual([
      { id: 7, url: `${PUBLIC_BASE}/events/3/photos/a.jpg`, position: 0 },
      { id: 9, url: `${PUBLIC_BASE}/events/3/photos/b.png`, position: 1 },
    ]);
    expect(detail).not.toHaveProperty('cover_key');
  });
});
