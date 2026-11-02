import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { TicketController } from '../../../../../../src/modules/ticket/adapters/inbound/controllers/ticket.controller.js';
import {
  TICKET_SERVICE,
  type TicketServicePort,
} from '../../../../../../src/modules/ticket/application/ports/inbound/services/ticket.service.port.js';
import type { Ticket } from '../../../../../../src/modules/ticket/core/entities/ticket.entity.js';

// chaves usadas pelo @thallesp/nestjs-better-auth (SetMetadata("PUBLIC") / SetMetadata("ROLES"))
const PUBLIC_KEY = 'PUBLIC';
const ROLES_KEY = 'ROLES';

const session = { user: { id: 'user-1' } } as unknown as UserSession;

const ticket: Ticket = {
  id: 1,
  user_id: 'user-1',
  reserved_at: new Date('2026-01-01T00:00:00Z'),
  is_paid: false,
  event_id: 10,
};

describe('TicketController', () => {
  let controller: TicketController;
  let ticketService: MockPort<TicketServicePort>;
  const reflector = new Reflector();

  beforeEach(async () => {
    ticketService = {
      reserveTicket: vi.fn(),
      confirmTicketPayment: vi.fn(),
      statusTicketsByEvent: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketController],
      providers: [{ provide: TICKET_SERVICE, useValue: ticketService }],
    }).compile();

    controller = module.get(TicketController);
  });

  describe('statusTicketsByEvent', () => {
    it('chama a porta com o id do evento', async () => {
      const status = { total: 10, available: 7, reserved: 3 };
      ticketService.statusTicketsByEvent.mockResolvedValue(status);

      await expect(controller.statusTicketsByEvent(10)).resolves.toBe(status);
      expect(ticketService.statusTicketsByEvent).toHaveBeenCalledWith(10);
    });

    it('é pública e mapeada em GET /status/:id', () => {
      const handler = handlerOf(TicketController, 'statusTicketsByEvent');
      expect(reflector.get(PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/status/:id');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
    });
  });

  describe('reservation', () => {
    it('usa o id do usuário da sessão e o event_id do body', async () => {
      ticketService.reserveTicket.mockResolvedValue(ticket);

      await expect(
        controller.reservation(session, { event_id: 10 }),
      ).resolves.toBe(ticket);
      expect(ticketService.reserveTicket).toHaveBeenCalledWith('user-1', 10);
    });

    it('exige sessão (não é pública) e é mapeada em POST /reservation', () => {
      const handler = handlerOf(TicketController, 'reservation');
      expect(reflector.get(PUBLIC_KEY, handler)).toBeUndefined();
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/reservation');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
    });
  });

  describe('webhookConfirmTicketPayment', () => {
    it('repassa id e user_id do body para confirmTicketPayment', async () => {
      const paid: Ticket = Object.assign({}, ticket, { is_paid: true });
      ticketService.confirmTicketPayment.mockResolvedValue(paid);

      await expect(
        controller.webhookConfirmTicketPayment({ id: 1, user_id: 'user-1' }),
      ).resolves.toBe(paid);
      expect(ticketService.confirmTicketPayment).toHaveBeenCalledWith(
        1,
        'user-1',
      );
    });

    // comportamento atual: o webhook e publico e nao valida assinatura/segredo do gateway,
    // entao qualquer cliente que saiba (ticket id, user_id) consegue marcar o ingresso como pago
    it('é pública e mapeada em POST /webhook/ticket/payment', () => {
      const handler = handlerOf(
        TicketController,
        'webhookConfirmTicketPayment',
      );
      expect(reflector.get(PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        '/webhook/ticket/payment',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
    });
  });

  it('a classe não é pública como um todo', () => {
    expect(reflector.get(PUBLIC_KEY, TicketController)).toBeUndefined();
  });
});
