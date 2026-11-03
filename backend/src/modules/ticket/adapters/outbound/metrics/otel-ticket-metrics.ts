import {Inject, Injectable} from "@nestjs/common";
import type {Counter, Histogram, Meter} from "@opentelemetry/api";
import {TicketMetricsPort} from "../../../application/ports/outbound/metrics/ticket-metrics.port.js";
import {ReservationOutcome} from "../../../core/entities/reservation.entity.js";
import {PaymentRejectionReason} from "../../../core/entities/payment.entity.js";
import {OTEL_METER} from "../../../../observability/adapters/outbound/otel/otel.providers.js";

// Em segundos, focado na faixa de uma reserva saudável (alvo: p95 < 500ms).
const RESERVATION_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5];

// Nomes no padrão OTel (com pontos). No Prometheus o Alloy converte:
//   bilheteria.reservations          -> bilheteria_reservations_total{outcome}
//   bilheteria.reservation.duration  -> bilheteria_reservation_duration_seconds_{bucket,sum,count}{outcome}
//   bilheteria.payments.confirmed    -> bilheteria_payments_confirmed_total
//   bilheteria.payments.rejected     -> bilheteria_payments_rejected_total{reason}
@Injectable()
export class OtelTicketMetrics implements TicketMetricsPort {
    private readonly reservations: Counter;
    private readonly reservationDuration: Histogram;
    private readonly paymentsConfirmed: Counter;
    private readonly paymentsRejected: Counter;

    constructor(@Inject(OTEL_METER) meter: Meter) {
        this.reservations = meter.createCounter('bilheteria.reservations', {
            description: 'Tentativas de reserva de ingresso, por desfecho',
            unit: '{reservation}',
        });
        this.reservationDuration = meter.createHistogram('bilheteria.reservation.duration', {
            description: 'Duração de uma tentativa de reserva, por desfecho',
            unit: 's',
            advice: {explicitBucketBoundaries: RESERVATION_DURATION_BUCKETS},
        });
        this.paymentsConfirmed = meter.createCounter('bilheteria.payments.confirmed', {
            description: 'Pagamentos de ingresso confirmados',
            unit: '{payment}',
        });
        this.paymentsRejected = meter.createCounter('bilheteria.payments.rejected', {
            description: 'Confirmações de pagamento recusadas, por motivo',
            unit: '{payment}',
        });
    }

    reservationAttempted(outcome: ReservationOutcome, durationMs: number): void {
        this.reservations.add(1, {outcome});
        this.reservationDuration.record(durationMs / 1000, {outcome});
    }

    paymentConfirmed(): void {
        this.paymentsConfirmed.add(1);
    }

    paymentRejected(reason: PaymentRejectionReason): void {
        this.paymentsRejected.add(1, {reason});
    }
}
