import {ReservationOutcome} from "../../../../core/entities/reservation.entity.js";
import {PaymentRejectionReason} from "../../../../core/entities/payment.entity.js";

export const TICKET_METRICS = Symbol('TICKET_METRICS');

// Métricas de negócio do módulo em termos do domínio: o service não sabe como (nem onde) viram números.
// Nunca recebem ids (usuário, evento, ticket): viram labels e explodiriam a cardinalidade.
export interface TicketMetricsPort {
    reservationAttempted(outcome: ReservationOutcome, durationMs: number): void;
    paymentConfirmed(): void;
    paymentRejected(reason: PaymentRejectionReason): void;
}
