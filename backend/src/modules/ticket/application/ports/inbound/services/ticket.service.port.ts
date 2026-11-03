import {Status} from "../../../../core/entities/status.entity.js";
import {Ticket} from "../../../../core/entities/ticket.entity.js";
import {MyTicket} from "../../../../core/entities/my-ticket.entity.js";

export const TICKET_SERVICE = Symbol('TICKET_SERVICE');

// A confirmação de pagamento saiu daqui: quem marca o ticket como pago é o módulo payment,
// depois de consultar o provedor (ver payment/application/services/payment.service.ts).
export interface TicketServicePort {
    reserveTicket(user_id: string, event_id: number): Promise<Ticket>;
    statusTicketsByEvent(id: number): Promise<Status>;
    listMyTickets(user_id: string): Promise<MyTicket[]>;
}
