/**
 * Pedido de email guardado na outbox. Os dados são um retrato do momento do fato (o email do
 * ingresso mostra o evento como estava na compra) e a `dedupeKey` garante um email por fato:
 * um webhook repetido não manda o mesmo email duas vezes.
 */
export interface TicketConfirmedData {
  userName: string;
  eventId: number;
  eventName: string;
  /** ISO 8601 (UTC). */
  eventStartsAt: string;
  eventLocation: string;
  ticketId: number;
  amountCents: number;
  currency: string;
}

export type EmailRequest = {
  kind: 'ticket_confirmed';
  to: string;
  dedupeKey: string;
  data: TicketConfirmedData;
};

export type EmailKind = EmailRequest['kind'];

/** Email pronto para o provedor. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Linha da outbox reservada pelo worker para envio. */
export type OutboxEmail = EmailRequest & {
  id: string;
  /** tentativas já feitas, contando a atual */
  attempts: number;
};

export function ticketConfirmedEmail(
  paymentId: string,
  to: string,
  data: TicketConfirmedData,
): EmailRequest {
  return {
    kind: 'ticket_confirmed',
    to,
    dedupeKey: `ticket-confirmed:${paymentId}`,
    data,
  };
}
