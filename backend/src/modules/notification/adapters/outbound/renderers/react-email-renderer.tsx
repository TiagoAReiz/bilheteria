import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/components';
import { EmailRendererPort } from '../../../application/ports/outbound/renderers/email-renderer.port.js';
import { EmailRequest, RenderedEmail } from '../../../core/entities/email.js';
import {
  TicketConfirmedEmail,
  ticketConfirmedSubject,
} from './templates/ticket-confirmed-email.js';
import {
  SalesOpeningEmail,
  salesOpeningSubject,
} from './templates/sales-opening-email.js';

/** Monta HTML e texto puro (clientes sem HTML e filtros de spam olham os dois) com React Email. */
@Injectable()
export class ReactEmailRenderer implements EmailRendererPort {
  private readonly frontendUrl: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.frontendUrl = config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
  }

  async render(request: EmailRequest): Promise<RenderedEmail> {
    switch (request.kind) {
      case 'ticket_confirmed': {
        const element = (
          <TicketConfirmedEmail
            {...request.data}
            myTicketsUrl={`${this.frontendUrl}/my-tickets`}
          />
        );
        return {
          subject: ticketConfirmedSubject(request.data),
          html: await render(element),
          text: await render(element, { plainText: true }),
        };
      }
      case 'sales_opening': {
        const element = (
          <SalesOpeningEmail
            {...request.data}
            eventUrl={`${this.frontendUrl}/events/${request.data.eventId}`}
          />
        );
        return {
          subject: salesOpeningSubject(request.data),
          html: await render(element),
          text: await render(element, { plainText: true }),
        };
      }
    }
  }
}
