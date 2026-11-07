import { Ticket } from './ticket.entity.js';

export const RESERVATION_TTL_MINUTES = 5;

export type ReservationResult =
  | { outcome: 'reserved'; ticket: Ticket }
  | { outcome: 'limit_reached' }
  | { outcome: 'sold_out' };

// Todos os desfechos de uma tentativa de reserva: os do repositório mais as regras checadas antes dele.
export type ReservationOutcome =
  | ReservationResult['outcome']
  | 'no_cpf'
  | 'event_started'
  | 'sales_not_started'
  | 'event_not_found';
