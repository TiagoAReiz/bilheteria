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
  TICKET_METRICS,
  type TicketMetricsPort,
} from '../../../../../src/modules/ticket/application/ports/outbound/metrics/ticket-metrics.port.js';
import {
  TRACING,
  type ActiveSpan,
  type TracingPort,
} from '../../../../../src/modules/observability/application/ports/outbound/tracing/tracing.port.js';
import { MAX_TICKETS_PER_USER_PER_EVENT } from '../../../../../src/modules/ticket/core/entities/reservation.entity.js';
import type { Ticket } from '../../../../../src/modules/ticket/core/entities/ticket.entity.js';
import type { Event } from '../../../../../src/modules/event/core/entities/event.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 10,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
  capacity: 100,
  price_cents: 5000,
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
  let metrics: MockPort<TicketMetricsPort>;
  let tracing: MockPort<TracingPort>;
  let span: MockPort<ActiveSpan>;

  beforeEach(async () => {
    ticketRepository = {
      reserveTicketWithinLimit: vi.fn(),
      getTicketsByUserAndEvent: vi.fn(),
      getCountAvailablesTicketsByEvent: vi.fn(),
      getCountAllTicketsByEvent: vi.fn(),
      getActiveTicketsByUser: vi.fn(),
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

    metrics = {
      reservationAttempted: vi.fn(),
    };
    // tracing de verdade fica no OtelTracing; aqui só executa o trabalho com um span fake
    span = { setAttributes: vi.fn() };
    tracing = {
      inSpan: vi.fn((_name, _attributes, work) => work(span)) as MockPort<TracingPort>['inSpan'],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: TICKET_REPOSITORY, useValue: ticketRepository },
        { provide: USER_SERVICE, useValue: userService },
        { provide: EVENT_SERVICE, useValue: eventService },
        { provide: TICKET_METRICS, useValue: metrics },
        { provide: TRACING, useValue: tracing },
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

    describe('métrica e span da reserva', () => {
      // cada caminho de reserveTicket e o outcome que ele precisa registrar
      const scenarios: [
        string,
        () => void,
        Parameters<TicketMetricsPort['reservationAttempted']>[0],
      ][] = [
        [
          'reservado',
          () =>
            ticketRepository.reserveTicketWithinLimit.mockResolvedValue({
              outcome: 'reserved',
              ticket: makeTicket(),
            }),
          'reserved',
        ],
        [
          'sem CPF',
          () => userService.hasCpf.mockResolvedValue(false),
          'no_cpf',
        ],
        [
          'evento inexistente',
          () =>
            eventService.getEventById.mockRejectedValue(
              new NotFoundException(),
            ),
          'event_not_found',
        ],
        [
          'evento já começou',
          () =>
            eventService.getEventById.mockResolvedValue(
              makeEvent({ starts_at: new Date(NOW) }),
            ),
          'event_started',
        ],
        [
          'limite atingido',
          () =>
            ticketRepository.reserveTicketWithinLimit.mockResolvedValue({
              outcome: 'limit_reached',
            }),
          'limit_reached',
        ],
        [
          'esgotado',
          () =>
            ticketRepository.reserveTicketWithinLimit.mockResolvedValue({
              outcome: 'sold_out',
            }),
          'sold_out',
        ],
      ];

      it.each(scenarios)(
        '%s: registra uma tentativa com outcome %s e marca o span',
        async (_caso, arrange, outcome) => {
          arrange();

          await service.reserveTicket('user-1', 10).catch(() => undefined);

          expect(metrics.reservationAttempted).toHaveBeenCalledTimes(1);
          expect(metrics.reservationAttempted).toHaveBeenCalledWith(
            outcome,
            expect.any(Number),
          );
          const [, durationMs] = metrics.reservationAttempted.mock.calls[0];
          expect(durationMs).toBeGreaterThanOrEqual(0);
          expect(span.setAttributes).toHaveBeenCalledWith({ outcome });
        },
      );

      it('executa a reserva dentro do span ticket.reserve com o event.id', async () => {
        ticketRepository.reserveTicketWithinLimit.mockResolvedValue({
          outcome: 'reserved',
          ticket: makeTicket(),
        });

        await service.reserveTicket('user-1', 10);

        expect(tracing.inSpan).toHaveBeenCalledWith(
          'ticket.reserve',
          { 'event.id': 10 },
          expect.any(Function),
        );
      });

      it('relança o NotFound original do evento', async () => {
        const notFound = new NotFoundException('O evento 10 não foi encontrado');
        eventService.getEventById.mockRejectedValue(notFound);

        await expect(service.reserveTicket('user-1', 10)).rejects.toBe(
          notFound,
        );
      });

      it('erro inesperado (ex.: banco fora) propaga sem métrica de negócio', async () => {
        const failure = new Error('connection refused');
        ticketRepository.reserveTicketWithinLimit.mockRejectedValue(failure);

        await expect(service.reserveTicket('user-1', 10)).rejects.toBe(
          failure,
        );
        expect(metrics.reservationAttempted).not.toHaveBeenCalled();
      });

      it('erro inesperado ao buscar o evento também propaga sem métrica', async () => {
        const failure = new Error('timeout');
        eventService.getEventById.mockRejectedValue(failure);

        await expect(service.reserveTicket('user-1', 10)).rejects.toBe(
          failure,
        );
        expect(metrics.reservationAttempted).not.toHaveBeenCalled();
      });
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

  describe('listMyTickets', () => {
    const event = { id: 10, name: 'Show', location: 'Arena', starts_at: new Date('2026-12-20T20:00:00Z') };

    it('busca só pagos e reservas dentro do TTL (corte = agora - 5 min)', async () => {
      ticketRepository.getActiveTicketsByUser.mockResolvedValue([]);

      await expect(service.listMyTickets('user-1')).resolves.toEqual([]);
      expect(ticketRepository.getActiveTicketsByUser).toHaveBeenCalledWith(
        'user-1',
        new Date(NOW.getTime() - 5 * 60 * 1000),
      );
    });

    it('pago vira paid sem prazo; reserva vira reserved com fim = reserved_at + TTL', async () => {
      const reservedAt = new Date(NOW.getTime() - 60 * 1000);
      ticketRepository.getActiveTicketsByUser.mockResolvedValue([
        { id: 1, is_paid: true, reserved_at: new Date('2026-06-01T00:00:00Z'), event },
        { id: 2, is_paid: false, reserved_at: reservedAt, event },
      ]);

      await expect(service.listMyTickets('user-1')).resolves.toEqual([
        { id: 1, status: 'paid', reserved_until: null, event },
        { id: 2, status: 'reserved', reserved_until: new Date(reservedAt.getTime() + 5 * 60 * 1000), event },
      ]);
    });
  });
});
