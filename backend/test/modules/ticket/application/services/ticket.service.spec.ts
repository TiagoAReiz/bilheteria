import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { TicketService } from '../../../../../src/modules/ticket/application/services/ticket.service.js';
import {
  TICKET_REPOSITORY,
  type TicketRepositoryPort,
} from '../../../../../src/modules/ticket/application/ports/outbound/repositories/ticket.repository.port.js';
import {
  USER_SERVICE,
  type UserServicePort,
} from '../../../../../src/modules/users/application/ports/inbound/services/user.service.port.js';
import {
  EVENT_SERVICE,
  type EventServicePort,
} from '../../../../../src/modules/event/application/ports/inbound/services/event.service.port.js';
import {
  MAX_TICKETS_PER_USER_PER_EVENT,
  RESERVATION_TTL_MINUTES,
} from '../../../../../src/modules/ticket/core/entities/reservation.entity.js';
import type { Ticket } from '../../../../../src/modules/ticket/core/entities/ticket.entity.js';
import type { Event } from '../../../../../src/modules/event/core/entities/event.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 10,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
  capacity: 100,
  available_tickets: 100,
  organizer_id: 'org-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  ...overrides,
});

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 1,
  user_id: 'user-1',
  reserved_at: NOW,
  is_paid: false,
  event_id: 10,
  ...overrides,
});

describe('TicketService', () => {
  let service: TicketService;
  let ticketRepository: MockPort<TicketRepositoryPort>;
  let userService: MockPort<UserServicePort>;
  let eventService: MockPort<EventServicePort>;

  beforeEach(async () => {
    ticketRepository = {
      reserveTicketWithinLimit: vi.fn(),
      getTicketsByUserAndEvent: vi.fn(),
      getCountAvailablesTicketsByEvent: vi.fn(),
      getCountAllTicketsByEvent: vi.fn(),
      getTicketById: vi.fn(),
      updateTicket: vi.fn(),
    };
    userService = {
      registerCpf: vi.fn(),
      hasCpf: vi.fn().mockResolvedValue(true),
      becomeOrganizer: vi.fn(),
    };
    eventService = {
      createEvent: vi.fn(),
      listUpcomingEvents: vi.fn(),
      getEventById: vi.fn().mockResolvedValue(makeEvent()),
      getEventIdsByOrganizer: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: TICKET_REPOSITORY, useValue: ticketRepository },
        { provide: USER_SERVICE, useValue: userService },
        { provide: EVENT_SERVICE, useValue: eventService },
      ],
    }).compile();

    service = module.get(TicketService);

    // so o Date e falsificado: o resto (setTimeout, promises) continua real
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('reserveTicket', () => {
    it('lança Forbidden quando o usuário não tem CPF e não consulta evento nem repositório', async () => {
      userService.hasCpf.mockResolvedValue(false);

      await expect(service.reserveTicket('user-1', 10)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(userService.hasCpf).toHaveBeenCalledWith('user-1');
      expect(eventService.getEventById).not.toHaveBeenCalled();
      expect(ticketRepository.reserveTicketWithinLimit).not.toHaveBeenCalled();
    });

    it('propaga o NotFound quando o evento não existe', async () => {
      eventService.getEventById.mockRejectedValue(
        new NotFoundException('O evento 10 não foi encontrado'),
      );

      await expect(service.reserveTicket('user-1', 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ticketRepository.reserveTicketWithinLimit).not.toHaveBeenCalled();
    });

    it('lança Conflict quando o evento já começou', async () => {
      eventService.getEventById.mockResolvedValue(
        makeEvent({ starts_at: new Date(NOW.getTime() - 1000) }),
      );

      await expect(service.reserveTicket('user-1', 10)).rejects.toThrow(
        ConflictException,
      );
      expect(ticketRepository.reserveTicketWithinLimit).not.toHaveBeenCalled();
    });

    it('lança Conflict quando o evento começa exatamente agora', async () => {
      eventService.getEventById.mockResolvedValue(
        makeEvent({ starts_at: new Date(NOW) }),
      );

      await expect(service.reserveTicket('user-1', 10)).rejects.toThrow(
        /já começou/,
      );
    });

    it('retorna o ticket quando o repositório reserva e usa MAX_TICKETS_PER_USER_PER_EVENT', async () => {
      const ticket = makeTicket();
      ticketRepository.reserveTicketWithinLimit.mockResolvedValue({
        outcome: 'reserved',
        ticket,
      });

      await expect(service.reserveTicket('user-1', 10)).resolves.toBe(ticket);
      expect(eventService.getEventById).toHaveBeenCalledWith(10);
      expect(ticketRepository.reserveTicketWithinLimit).toHaveBeenCalledWith(
        'user-1',
        10,
        MAX_TICKETS_PER_USER_PER_EVENT,
      );
      expect(MAX_TICKETS_PER_USER_PER_EVENT).toBe(2);
    });

    it('lança Conflict de limite quando o repositório retorna limit_reached', async () => {
      ticketRepository.reserveTicketWithinLimit.mockResolvedValue({
        outcome: 'limit_reached',
      });

      const promise = service.reserveTicket('user-1', 10);
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow(/limite de ingressos/);
    });

    it('lança Conflict de esgotado quando o repositório retorna sold_out', async () => {
      ticketRepository.reserveTicketWithinLimit.mockResolvedValue({
        outcome: 'sold_out',
      });

      const promise = service.reserveTicket('user-1', 10);
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow(
        'Não há ingressos disponíveis para o evento 10',
      );
    });
  });

  describe('confirmTicketPayment', () => {
    it('lança Conflict quando o ticket pertence a outro usuário', async () => {
      ticketRepository.getTicketById.mockResolvedValue(
        makeTicket({ user_id: 'other-user' }),
      );

      await expect(service.confirmTicketPayment(1, 'user-1')).rejects.toThrow(
        /não pertence ao usuário/,
      );
      expect(ticketRepository.updateTicket).not.toHaveBeenCalled();
    });

    it('lança Conflict quando o ticket não tem dono (user_id null)', async () => {
      ticketRepository.getTicketById.mockResolvedValue(
        makeTicket({ user_id: null, reserved_at: null }),
      );

      await expect(service.confirmTicketPayment(1, 'user-1')).rejects.toThrow(
        /não pertence ao usuário/,
      );
    });

    it('lança Conflict quando a reserva expirou', async () => {
      ticketRepository.getTicketById.mockResolvedValue(
        makeTicket({ reserved_at: new Date(NOW.getTime() - TTL_MS - 1) }),
      );

      await expect(service.confirmTicketPayment(1, 'user-1')).rejects.toThrow(
        /expirou/,
      );
      expect(ticketRepository.updateTicket).not.toHaveBeenCalled();
    });

    it('lança Conflict quando o ticket não tem reserved_at', async () => {
      ticketRepository.getTicketById.mockResolvedValue(
        makeTicket({ reserved_at: null }),
      );

      await expect(
        service.confirmTicketPayment(1, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ticketRepository.updateTicket).not.toHaveBeenCalled();
    });

    it('marca is_paid e chama updateTicket quando a reserva está válida', async () => {
      const ticket = makeTicket({
        reserved_at: new Date(NOW.getTime() - 60 * 1000),
      });
      ticketRepository.getTicketById.mockResolvedValue(ticket);
      ticketRepository.updateTicket.mockImplementation(async (t) => t);

      const result = await service.confirmTicketPayment(1, 'user-1');

      expect(ticketRepository.getTicketById).toHaveBeenCalledWith(1);
      expect(ticketRepository.updateTicket).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, is_paid: true }),
      );
      expect(result.is_paid).toBe(true);
    });

    it('aceita o pagamento exatamente no limite do TTL', async () => {
      ticketRepository.getTicketById.mockResolvedValue(
        makeTicket({ reserved_at: new Date(NOW.getTime() - TTL_MS) }),
      );
      ticketRepository.updateTicket.mockImplementation(async (t) => t);

      await expect(
        service.confirmTicketPayment(1, 'user-1'),
      ).resolves.toMatchObject({ is_paid: true });
    });

    it('o tempo é medido no momento da confirmação (fake timers)', async () => {
      ticketRepository.getTicketById.mockImplementation(async () =>
        makeTicket({ reserved_at: new Date(NOW) }),
      );
      ticketRepository.updateTicket.mockImplementation(async (t) => t);

      vi.setSystemTime(NOW.getTime() + TTL_MS - 1);
      await expect(
        service.confirmTicketPayment(1, 'user-1'),
      ).resolves.toMatchObject({ is_paid: true });

      vi.setSystemTime(NOW.getTime() + TTL_MS + 1);
      await expect(service.confirmTicketPayment(1, 'user-1')).rejects.toThrow(
        /expirou/,
      );
    });

    // comportamento atual: um ticket ja pago cuja reserva tem mais de TTL minutos
    // e recusado como "expirado". Um reenvio do webhook pelo gateway apos 5 min
    // recebe 409 mesmo o ingresso estando pago (falta idempotencia).
    it('documenta: ticket já pago com reserved_at antigo é recusado como expirado', async () => {
      ticketRepository.getTicketById.mockResolvedValue(
        makeTicket({
          is_paid: true,
          reserved_at: new Date(NOW.getTime() - TTL_MS - 60 * 1000),
        }),
      );

      await expect(service.confirmTicketPayment(1, 'user-1')).rejects.toThrow(
        /expirou/,
      );
    });

    it('propaga o NotFound do repositório', async () => {
      ticketRepository.getTicketById.mockRejectedValue(new NotFoundException());
      await expect(
        service.confirmTicketPayment(1, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('statusTicketsByEvent', () => {
    it('calcula reserved como total - available', async () => {
      ticketRepository.getCountAllTicketsByEvent.mockResolvedValue(100);
      ticketRepository.getCountAvailablesTicketsByEvent.mockResolvedValue(70);

      await expect(service.statusTicketsByEvent(10)).resolves.toEqual({
        total: 100,
        available: 70,
        reserved: 30,
      });
      expect(eventService.getEventById).toHaveBeenCalledWith(10);
      expect(ticketRepository.getCountAllTicketsByEvent).toHaveBeenCalledWith(
        10,
      );
      expect(
        ticketRepository.getCountAvailablesTicketsByEvent,
      ).toHaveBeenCalledWith(10);
    });

    it('retorna reserved 0 quando tudo está disponível', async () => {
      ticketRepository.getCountAllTicketsByEvent.mockResolvedValue(5);
      ticketRepository.getCountAvailablesTicketsByEvent.mockResolvedValue(5);

      await expect(service.statusTicketsByEvent(10)).resolves.toEqual({
        total: 5,
        available: 5,
        reserved: 0,
      });
    });

    it('propaga o 404 do evento sem consultar os tickets', async () => {
      eventService.getEventById.mockRejectedValue(new NotFoundException());

      await expect(service.statusTicketsByEvent(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ticketRepository.getCountAllTicketsByEvent).not.toHaveBeenCalled();
      expect(
        ticketRepository.getCountAvailablesTicketsByEvent,
      ).not.toHaveBeenCalled();
    });
  });
});
