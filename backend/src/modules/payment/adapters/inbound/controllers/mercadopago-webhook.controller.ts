import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  PAYMENT_SERVICE,
  type PaymentServicePort,
} from '../../../application/ports/inbound/services/payment.service.port.js';
import { MercadoPagoNotificationQueryDto } from '../../dto/mercadopago-notification-dto.js';
import { MercadoPagoSignatureGuard } from '../webhooks/mercadopago-signature.guard.js';

// tópico "Order (Mercado Pago)" do painel; o payload chega com type=order
const ORDER_TOPICS = new Set(['order', 'orders']);

/**
 * Notificações do Mercado Pago. Sem sessão (quem chama é o Mercado Pago), mas só passa com a
 * assinatura `x-signature` válida (MercadoPagoSignatureGuard). Respostas:
 * - 200: processada, repetida ou ignorada (o Mercado Pago para de reenviar);
 * - 401: assinatura ausente/inválida/velha ou segredo não configurado;
 * - 503: provedor indisponível ao consultar/estornar (o Mercado Pago reenvia depois).
 */
@Controller('webhooks')
export class MercadoPagoWebhookController {
  constructor(
    @Inject(PAYMENT_SERVICE)
    private readonly paymentService: PaymentServicePort,
  ) {}

  @AllowAnonymous()
  @UseGuards(MercadoPagoSignatureGuard)
  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  async receive(@Query() query: MercadoPagoNotificationQueryDto) {
    if (query.type !== undefined && !ORDER_TOPICS.has(query.type)) {
      // outro tópico ligado no painel (ex.: payment): nada a fazer, e não deve ser reenviado
      return { received: true };
    }
    await this.paymentService.handleProviderNotification(query['data.id']);
    return { received: true };
  }
}
