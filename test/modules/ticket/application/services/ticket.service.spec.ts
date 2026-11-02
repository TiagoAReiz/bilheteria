import { Test, TestingModule } from '@nestjs/testing';
import { TicketService } from '../../../../../src/modules/ticket/application/services/ticket.service.js';
import { TICKET_REPOSITORY } from '../../../../../src/modules/ticket/application/ports/outbound/repositories/ticket.repository.port.js';
import { USER_SERVICE } from '../../../../../src/modules/users/application/ports/inbound/services/user.service.port.js';
import { EVENT_SERVICE } from '../../../../../src/modules/event/application/ports/inbound/services/event.service.port.js';

describe('TicketService', () => {
  let service: TicketService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: TICKET_REPOSITORY, useValue: {} },
        { provide: USER_SERVICE, useValue: {} },
        { provide: EVENT_SERVICE, useValue: {} },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
