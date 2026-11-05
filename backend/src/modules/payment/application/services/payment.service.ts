import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CheckoutSession,
  NotApprovedStatus,
  PAYMENT_CURRENCY,
  Payment,
  PaymentView,
  toPaymentView,
} from '../../core/entities/payment.entity.js';
import { CheckoutBlocker } from '../../core/entities/payment-rules.js';
import {
  NotificationOutcome,
  Payer,
  PaymentServicePort,
} from '../ports/inbound/services/payment.service.port.js';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayRejectedError,
  PaymentGatewayUnavailableError,
  ProviderOrder,
  type PaymentGatewayPort,
} from '../ports/outbound/gateways/payment-gateway.port.js';
import {
  PAYMENT_REPOSITORY,
  ProviderIds,
  type PaymentRepositoryPort,
} from '../ports/outbound/repositories/payment.repository.port.js';
import {
  PAYMENT_METRICS,
  type PaymentMetricsPort,
} from '../ports/outbound/metrics/payment-metrics.port.js';
import {
  TRACING,
  type ActiveSpan,
  type TracingPort,
} from '../../../observability/application/ports/outbound/tracing/tracing.port.js';

// nosso id de pagamento (uuid) é a referência externa enviada ao provedor
const PAYMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHECKOUT_BLOCKED: Record<CheckoutBlocker, () => Error> = {
  ticket_not_found: () => new NotFoundException('Ingresso não encontrado'),
  wrong_owner: () =>
    new ForbiddenException('Este ingresso não está reservado para você'),
  already_paid: () => new ConflictException('Este ingresso já está pago'),
  expired: () =>
    new ConflictException(
      'Sua reserva expirou (ou está expirando). Reserve o ingresso de novo para pagar',
    ),
  not_on_sale: () =>
    new ConflictException('As vendas deste evento não estão disponíveis'),
};

const NOT_APPROVED: Partial<
  Record<ProviderOrder['status'], NotApprovedStatus>
> = {
  rejected: 'rejected',
  cancelled: 'cancelled',
  expired: 'expired',
};

@Injectable()
export class PaymentService implements PaymentServicePort {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly repository: PaymentRepositoryPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_METRICS) private readonly metrics: PaymentMetricsPort,
    @Inject(TRACING) private readonly tracing: TracingPort,
  ) {}

  async createCheckout(
    payer: Payer,
    ticketId: number,
  ): Promise<CheckoutSession> {
    return this.tracing.inSpan(
      'payment.checkout',
      { 'ticket.id': ticketId },
      async (span) => {
        const opened = await this.repository.openCheckout({
          ticketId,
          userId: payer.id,
          provider: this.gateway.provider,
          currency: PAYMENT_CURRENCY,
        });
        span.setAttributes({ outcome: opened.outcome });

        switch (opened.outcome) {
          case 'blocked':
            span.setAttributes({ reason: opened.reason });
            throw CHECKOUT_BLOCKED[opened.reason]();
          case 'in_progress':
            throw new ConflictException(
              'O checkout deste ingresso já está sendo criado. Tente de novo em alguns segundos',
            );
          case 'reused':
            span.setAttributes({ 'payment.id': opened.payment.id });
            this.metrics.checkoutOpened('reused');
            return toSession(opened.payment, opened.payment.checkout_url);
          case 'created': {
            const { payment, ticket } = opened;
            span.setAttributes({ 'payment.id': payment.id });
            const created = await this.requestCheckout(
              payment,
              ticket.event_name,
              payer.email,
            );
            const attached = await this.repository.attachCheckout(
              payment.id,
              created.providerOrderId,
              created.checkoutUrl,
            );
            if (!attached) {
              // outro checkout descartou este enquanto o provedor respondia (só passando do grace)
              throw new ConflictException(
                'Sua reserva mudou durante o checkout. Tente de novo',
              );
            }
            this.metrics.checkoutOpened('created');
            return toSession(attached, created.checkoutUrl);
          }
        }
      },
    );
  }

  private async requestCheckout(
    payment: Payment,
    eventName: string,
    payerEmail: string,
  ) {
    try {
      return await this.gateway.createCheckout({
        paymentId: payment.id,
        ticketId: payment.ticket_id,
        title: `Ingresso: ${eventName}`,
        amountCents: payment.amount_cents,
        currency: payment.currency,
        payerEmail,
        expiresAt: payment.expires_at,
      });
    } catch (error) {
      // sem checkout no provedor: libera o ticket para uma nova tentativa
      await this.repository.markCheckoutFailed(payment.id);
      throw toHttpError(error);
    }
  }

  async getPayment(userId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.repository.findById(paymentId);
    // pagamento de outra pessoa responde igual a inexistente: não confirma que o id existe
    if (!payment || payment.user_id !== userId) {
      throw new NotFoundException('Pagamento não encontrado');
    }
    return toPaymentView(payment);
  }

  async handleProviderNotification(
    providerOrderId: string,
  ): Promise<NotificationOutcome> {
    return this.tracing.inSpan(
      'payment.notification',
      { 'provider.order_id': providerOrderId },
      async (span) => {
        const outcome = await this.processNotification(providerOrderId, span);
        span.setAttributes({ outcome });
        return outcome;
      },
    );
  }

  private async processNotification(
    providerOrderId: string,
    span: ActiveSpan,
  ): Promise<NotificationOutcome> {
    // o corpo da notificação não é usado: o estado vem da API do provedor
    const order = await this.gateway
      .getOrder(providerOrderId)
      .catch((error: unknown) => {
        throw toHttpError(error);
      });
    if (!order) {
      this.logger.warn(
        `Notificação de pedido desconhecido no provedor: ${providerOrderId}`,
      );
      return 'ignored';
    }
    const payment = await this.findPaymentOf(order);
    if (!payment) {
      return 'ignored';
    }
    span.setAttributes({
      'payment.id': payment.id,
      'provider.status': order.status,
    });
    const ids: ProviderIds = {
      providerOrderId: order.providerOrderId,
      providerPaymentId: order.providerPaymentId,
    };

    switch (order.status) {
      case 'approved':
        return this.settleApproved(payment, order, ids);
      case 'rejected':
      case 'cancelled':
      case 'expired': {
        const status = NOT_APPROVED[order.status] as NotApprovedStatus;
        const changed = await this.repository.markNotApproved(
          payment.id,
          status,
          ids,
        );
        if (!changed) {
          return 'duplicate';
        }
        this.metrics.paymentNotApproved(status);
        return 'not_approved';
      }
      case 'refunded':
        return this.providerRefunded(payment, ids);
      case 'charged_back':
        // contestação depois de pago: o ingresso já foi entregue; precisa de análise humana
        this.logger.error(
          `Chargeback no pagamento ${payment.id} (pedido ${order.providerOrderId}); revisar manualmente`,
        );
        return 'duplicate';
      case 'pending':
        return 'pending';
    }
  }

  private async findPaymentOf(order: ProviderOrder): Promise<Payment | null> {
    const reference = order.externalReference;
    if (!reference || !PAYMENT_ID.test(reference)) {
      this.logger.warn(
        `Pedido ${order.providerOrderId} sem referência de pagamento nossa; ignorado`,
      );
      return null;
    }
    const payment = await this.repository.findById(reference);
    if (!payment) {
      this.logger.warn(
        `Pedido ${order.providerOrderId} aponta para o pagamento ${reference}, que não existe; ignorado`,
      );
      return null;
    }
    // a referência é nossa, mas o pedido tem de ser o que criamos para ela
    if (
      payment.provider !== this.gateway.provider ||
      (payment.provider_order_id !== null &&
        payment.provider_order_id !== order.providerOrderId)
    ) {
      this.logger.warn(
        `Pedido ${order.providerOrderId} não corresponde ao pagamento ${payment.id}; ignorado`,
      );
      return null;
    }
    return payment;
  }

  private async settleApproved(
    payment: Payment,
    order: ProviderOrder,
    ids: ProviderIds,
  ): Promise<NotificationOutcome> {
    const settled = await this.repository.settleApproved(payment.id, ids, {
      amountCents: order.amountCents,
      currency: order.currency,
    });
    switch (settled.outcome) {
      case 'confirmed':
        this.metrics.paymentConfirmed();
        this.logger.log(
          `Pagamento ${payment.id} aprovado; ticket ${payment.ticket_id} pago`,
        );
        return 'confirmed';
      case 'already_approved':
      case 'already_refunded':
      case 'not_found':
        return 'duplicate';
      case 'refund_required': {
        // registra a decisão antes do estorno: se o estorno falhar, a próxima notificação refaz
        this.metrics.paymentRejected(settled.reason);
        this.logger.warn(
          `Pagamento ${payment.id} aprovado mas recusado (${settled.reason}); estornando o pedido ${order.providerOrderId}`,
        );
        await this.gateway
          .refund(order.providerOrderId)
          .catch((error: unknown) => {
            throw toHttpError(error);
          });
        await this.repository.markRefunded(payment.id, ids);
        this.metrics.paymentRefunded(settled.reason);
        return 'refunded';
      }
    }
  }

  private async providerRefunded(
    payment: Payment,
    ids: ProviderIds,
  ): Promise<NotificationOutcome> {
    if (payment.status === 'approved') {
      // estorno feito fora da API (painel do Mercado Pago): o ingresso continua pago aqui
      this.logger.error(
        `Pagamento ${payment.id} foi estornado no provedor depois de aprovado; revisar o ticket ${payment.ticket_id}`,
      );
      return 'duplicate';
    }
    return (await this.repository.markRefunded(payment.id, ids))
      ? 'refunded'
      : 'duplicate';
  }
}

function toSession(payment: Payment, checkoutUrl: string): CheckoutSession {
  return {
    payment_id: payment.id,
    checkout_url: checkoutUrl,
    expires_at: payment.expires_at,
  };
}

// Falha temporária vira 503 (o Mercado Pago reenvia a notificação; o front pode tentar de novo).
// Recusa do provedor vira 502: problema nosso/de configuração, não do usuário.
function toHttpError(error: unknown): unknown {
  if (error instanceof PaymentGatewayUnavailableError) {
    return new ServiceUnavailableException(
      'O provedor de pagamento está indisponível. Tente novamente em instantes',
    );
  }
  if (error instanceof PaymentGatewayRejectedError) {
    return new BadGatewayException(
      'O provedor de pagamento recusou a operação',
    );
  }
  return error;
}
