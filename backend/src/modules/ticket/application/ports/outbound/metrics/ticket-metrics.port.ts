import { ReservationOutcome } from '../../../../core/entities/reservation.entity.js';

export const TICKET_METRICS = Symbol('TICKET_METRICS');

// Métricas de negócio do módulo em termos do domínio: o service não sabe como (nem onde) viram números.
// Nunca recebem ids (usuário, evento, ticket): viram labels e explodiriam a cardinalidade.
// As métricas de pagamento ficam na PAYMENT_METRICS (módulo payment), com os mesmos nomes de antes.
export interface TicketMetricsPort {
  reservationAttempted(outcome: ReservationOutcome, durationMs: number): void;
}
