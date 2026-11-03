import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { EventController } from '../../../../../../src/modules/event/adapters/inbound/controllers/event.controller.js';
import {
  EVENT_SERVICE,
  type EventServicePort,
} from '../../../../../../src/modules/event/application/ports/inbound/services/event.service.port.js';
import type { CreateEventDto } from '../../../../../../src/modules/event/adapters/dto/create-event-dto.js';
import type { Event } from '../../../../../../src/modules/event/core/entities/event.entity.js';
import { Role } from '../../../../../../src/modules/users/core/entities/role.js';

const PUBLIC_KEY = 'PUBLIC';
const ROLES_KEY = 'ROLES';

const session = { user: { id: 'org-1' } } as unknown as UserSession;

const event: Event = {
  id: 1,
  name: 'Show',
  description: 'desc',
  location: 'Arena',
  starts_at: new Date('2030-01-01T20:00:00Z'),
  capacity: 10,
  price_cents: 5000,
  available_tickets: 10,
  organizer_id: 'org-1',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
};

describe('EventController', () => {
  let controller: EventController;
  let eventService: MockPort<EventServicePort>;
  const reflector = new Reflector();

  beforeEach(async () => {
    eventService = {
      createEvent: vi.fn(),
      listUpcomingEvents: vi.fn(),
      getEventById: vi.fn(),
      getEventIdsByOrganizer: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventController],
      providers: [{ provide: EVENT_SERVICE, useValue: eventService }],
    }).compile();

    controller = module.get(EventController);
  });

  it('está montado em /events', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EventController)).toBe('events');
  });

  describe('create', () => {
    it('monta o NewEvent explicitamente com organizer_id da sessão e ignora campos extras do body', async () => {
      eventService.createEvent.mockResolvedValue(event);
      const starts_at = new Date('2030-01-01T20:00:00Z');
      const body = {
        name: 'Show',
        description: 'desc',
        location: 'Arena',
        starts_at,
        capacity: 10,
        price_cents: 5000,
        // campos que o cliente nao pode definir
        organizer_id: 'hacker',
        id: 999,
        deleted_at: new Date(),
      } as unknown as CreateEventDto;

      await expect(controller.create(session, body)).resolves.toBe(event);
      expect(eventService.createEvent).toHaveBeenCalledTimes(1);
      expect(eventService.createEvent.mock.calls[0][0]).toStrictEqual({
        name: 'Show',
        description: 'desc',
        location: 'Arena',
        starts_at,
        capacity: 10,
        price_cents: 5000,
        organizer_id: 'org-1',
      });
    });

    it('exige ORGANIZER ou ADMIN e é mapeado em POST /events', () => {
      const handler = handlerOf(EventController, 'create');
      expect(reflector.get(ROLES_KEY, handler)).toEqual([
        Role.ORGANIZER,
        Role.ADMIN,
      ]);
      expect(reflector.get(ROLES_KEY, handler)).toEqual(['ORGANIZER', 'ADMIN']);
      expect(reflector.get(PUBLIC_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
    });
  });

  describe('listUpcoming', () => {
    it('delega para listUpcomingEvents', async () => {
      eventService.listUpcomingEvents.mockResolvedValue([event]);
      await expect(controller.listUpcoming()).resolves.toEqual([event]);
      expect(eventService.listUpcomingEvents).toHaveBeenCalledTimes(1);
    });

    it('é pública e mapeada em GET /events', () => {
      const handler = handlerOf(EventController, 'listUpcoming');
      expect(reflector.get(PUBLIC_KEY, handler)).toBe(true);
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
    });
  });

  describe('getById', () => {
    it('delega para getEventById com o id', async () => {
      eventService.getEventById.mockResolvedValue(event);
      await expect(controller.getById(1)).resolves.toBe(event);
      expect(eventService.getEventById).toHaveBeenCalledWith(1);
    });

    it('é pública e mapeada em GET /events/:id', () => {
      const handler = handlerOf(EventController, 'getById');
      expect(reflector.get(PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
    });
  });
});
