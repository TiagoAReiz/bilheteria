import { Test, TestingModule } from '@nestjs/testing';
import { TicketController } from '../../../../../../src/modules/ticket/adapters/inbound/controllers/ticket.controller.js';
import { TICKET_SERVICE } from '../../../../../../src/modules/ticket/application/ports/inbound/services/ticket.service.port.js';

describe('TicketController', () => {
  let controller: TicketController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketController],
      providers: [{ provide: TICKET_SERVICE, useValue: {} }],
    }).compile();

    controller = module.get<TicketController>(TicketController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
