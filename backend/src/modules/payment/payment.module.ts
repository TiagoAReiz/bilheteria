import { Module } from '@nestjs/common';
import { PaymentController } from './adapters/inbound/controllers/payment.controller.js';
import { MercadoPagoWebhookController } from './adapters/inbound/controllers/mercadopago-webhook.controller.js';
import { MercadoPagoSignatureGuard } from './adapters/inbound/webhooks/mercadopago-signature.guard.js';
import { PaymentService } from './application/services/payment.service.js';
import { PaymentRepository } from './adapters/outbound/repositories/payment.repository.js';
import { MercadoPagoGateway } from './adapters/outbound/gateways/mercadopago.gateway.js';
import { OtelPaymentMetrics } from './adapters/outbound/metrics/otel-payment-metrics.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { PAYMENT_SERVICE } from './application/ports/inbound/services/payment.service.port.js';
import { PAYMENT_GATEWAY } from './application/ports/outbound/gateways/payment-gateway.port.js';
import { PAYMENT_REPOSITORY } from './application/ports/outbound/repositories/payment.repository.port.js';
import { PAYMENT_METRICS } from './application/ports/outbound/metrics/payment-metrics.port.js';

@Module({
  controllers: [PaymentController, MercadoPagoWebhookController],
  providers: [
    { provide: PAYMENT_SERVICE, useClass: PaymentService },
    { provide: PAYMENT_REPOSITORY, useClass: PaymentRepository },
    { provide: PAYMENT_GATEWAY, useClass: MercadoPagoGateway },
    { provide: PAYMENT_METRICS, useClass: OtelPaymentMetrics },
    MercadoPagoSignatureGuard,
  ],
  imports: [PrismaModule, ObservabilityModule],
})
export class PaymentModule {}
