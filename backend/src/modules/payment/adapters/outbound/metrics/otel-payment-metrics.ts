import {Inject, Injectable} from "@nestjs/common";
import type {Counter, Meter} from "@opentelemetry/api";
import {
    PaymentMetricsPort,
    WebhookRejectionReason,
} from "../../../application/ports/outbound/metrics/payment-metrics.port.js";
import {CheckoutOutcome, NotApprovedStatus, PaymentRejectionReason} from "../../../core/entities/payment.entity.js";
import {OTEL_METER} from "../../../../observability/adapters/outbound/otel/otel.providers.js";

// Nomes OTel; no Prometheus o Alloy converte:
//   bilheteria.payments.confirmed         -> bilheteria_payments_confirmed_total          (mesmo nome de antes)
//   bilheteria.payments.rejected          -> bilheteria_payments_rejected_total{reason}   (mesmo nome de antes)
//   bilheteria.payments.refunded          -> bilheteria_payments_refunded_total{reason}
//   bilheteria.payments.not_approved      -> bilheteria_payments_not_approved_total{status}
//   bilheteria.payments.checkouts         -> bilheteria_payments_checkouts_total{outcome}
//   bilheteria.payments.webhooks.rejected -> bilheteria_payments_webhooks_rejected_total{reason}
// Labels só com valores fixos (poucos e conhecidos); ids vão em atributos de span.
@Injectable()
export class OtelPaymentMetrics implements PaymentMetricsPort {
    private readonly checkouts: Counter;
    private readonly confirmed: Counter;
    private readonly rejected: Counter;
    private readonly refunded: Counter;
    private readonly notApproved: Counter;
    private readonly webhooksRejected: Counter;

    constructor(@Inject(OTEL_METER) meter: Meter) {
        this.checkouts = meter.createCounter('bilheteria.payments.checkouts', {
            description: 'Checkouts abertos, criados no provedor ou reaproveitados',
            unit: '{checkout}',
        });
        this.confirmed = meter.createCounter('bilheteria.payments.confirmed', {
            description: 'Pagamentos de ingresso confirmados',
            unit: '{payment}',
        });
        this.rejected = meter.createCounter('bilheteria.payments.rejected', {
            description: 'Pagamentos aprovados pelo provedor mas recusados (viram estorno), por motivo',
            unit: '{payment}',
        });
        this.refunded = meter.createCounter('bilheteria.payments.refunded', {
            description: 'Estornos concluídos, por motivo',
            unit: '{payment}',
        });
        this.notApproved = meter.createCounter('bilheteria.payments.not_approved', {
            description: 'Pagamentos encerrados sem cobrança no provedor, por status',
            unit: '{payment}',
        });
        this.webhooksRejected = meter.createCounter('bilheteria.payments.webhooks.rejected', {
            description: 'Notificações do provedor recusadas antes do processamento, por motivo',
            unit: '{notification}',
        });
    }

    checkoutOpened(outcome: CheckoutOutcome): void {
        this.checkouts.add(1, {outcome});
    }

    paymentConfirmed(): void {
        this.confirmed.add(1);
    }

    paymentRejected(reason: PaymentRejectionReason): void {
        this.rejected.add(1, {reason});
    }

    paymentRefunded(reason: PaymentRejectionReason): void {
        this.refunded.add(1, {reason});
    }

    paymentNotApproved(status: NotApprovedStatus): void {
        this.notApproved.add(1, {status});
    }

    webhookRejected(reason: WebhookRejectionReason): void {
        this.webhooksRejected.add(1, {reason});
    }
}
