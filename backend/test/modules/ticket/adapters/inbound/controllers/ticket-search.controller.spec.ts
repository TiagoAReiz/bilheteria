import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { TicketSearchController } from '../../../../../../src/modules/ticket/adapters/inbound/controllers/ticket-search.controller.js';
import {
  TICKET_SEARCH_SERVICE,
  type TicketSearchServicePort,
} from '../../../../../../src/modules/ticket/application/ports/inbound/services/ticket-search.service.port.js';
import type { SearchTicketsDto } from '../../../../../../src/modules/ticket/adapters/dto/search-tickets-dto.js';
import { Role } from '../../../../../../src/modules/users/core/entities/role.js';

const sessionWith = (role: string) =>
  ({ user: { id: 'user-1', role } }) as unknown as UserSession;

const query = { page: 1, size: 20 } as SearchTicketsDto;

describe('TicketSearchController', () => {
  let controller: TicketSearchController;
  let service: MockPort<TicketSearchServicePort>;
  const reflector = new Reflector();

  beforeEach(async () => {
    service = { searchTickets: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [TicketSearchController],
      providers: [{ provide: TICKET_SEARCH_SERVICE, useValue: service }],
    }).compile();
    controller = module.get(TicketSearchController);
  });

  it('é restrita a ADMIN e ORGANIZER e mapeada em GET /tickets/search', () => {
    const handler = handlerOf(TicketSearchController, 'search');
    expect(Reflect.getMetadata(PATH_METADATA, TicketSearchController)).toBe(
      'tickets',
    );
    expect(reflector.get('ROLES', handler)).toEqual([
      Role.ADMIN,
      Role.ORGANIZER,
    ]);
    expect(reflector.get('PUBLIC', handler)).toBeUndefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('search');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('repassa o solicitante da sessão e os filtros', async () => {
    await controller.search(sessionWith('ADMIN'), {
      page: 1,
      size: 20,
      event_id: 5,
      status: 'paid',
    } as SearchTicketsDto);

    expect(service.searchTickets).toHaveBeenCalledWith(
      { id: 'user-1', role: Role.ADMIN },
      { eventId: 5, status: 'paid', page: 1, size: 20 },
    );
  });

  it.each(['ORGANIZER', 'USER', ''])(
    'papel %j que não é ADMIN cai no escopo restrito de organizador',
    async (role) => {
      await controller.search(sessionWith(role), query);

      expect(service.searchTickets.mock.calls[0][0]).toEqual({
        id: 'user-1',
        role: Role.ORGANIZER,
      });
    },
  );
});
