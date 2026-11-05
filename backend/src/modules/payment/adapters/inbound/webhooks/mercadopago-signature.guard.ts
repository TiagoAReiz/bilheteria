import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  PAYMENT_METRICS,
  type PaymentMetricsPort,
} from '../../../application/ports/outbound/metrics/payment-metrics.port.js';
import {
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  verifyMercadoPagoSignature,
} from './mercadopago-signature.js';

const firstValue = (value: unknown): string | undefined => {
  const raw: unknown = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : undefined;
};

// header controlado por quem chama: só caracteres de id vão para o log (sem quebra de linha)
const safeForLog = (value: string | undefined): string =>
  value?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || '-';

/**
 * Só deixa passar notificação assinada pelo Mercado Pago. Roda antes de qualquer pipe ou
 * consulta: requisição sem assinatura válida recebe 401 sem tocar no banco nem no provedor.
 */
@Injectable()
export class MercadoPagoSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MercadoPagoSignatureGuard.name);
  private readonly secret: string | undefined;
  private readonly toleranceSeconds: number;

  constructor(
    config: ConfigService,
    @Inject(PAYMENT_METRICS) private readonly metrics: PaymentMetricsPort,
  ) {
    this.secret = config.get<string>('MP_WEBHOOK_SECRET') || undefined;
    const rawTolerance = config.get<string>('MP_WEBHOOK_TOLERANCE_SECONDS');
    this.toleranceSeconds = rawTolerance
      ? Number(rawTolerance)
      : DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
    if (
      !Number.isInteger(this.toleranceSeconds) ||
      this.toleranceSeconds <= 0
    ) {
      throw new Error(
        `MP_WEBHOOK_TOLERANCE_SECONDS inválido: "${rawTolerance}"`,
      );
    }
    if (!this.secret) {
      this.logger.warn(
        'MP_WEBHOOK_SECRET não configurado: todas as notificações do Mercado Pago serão recusadas',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = firstValue(request.headers['x-request-id']);
    const check = verifyMercadoPagoSignature(
      {
        signature: firstValue(request.headers['x-signature']),
        requestId,
        // o id assinado é o da query string (?data.id=...), não o do corpo
        dataId: firstValue(
          (request.query as Record<string, unknown>)['data.id'],
        ),
      },
      this.secret,
      Date.now(),
      this.toleranceSeconds,
    );
    if (!check.ok) {
      this.metrics.webhookRejected(check.reason);
      this.logger.warn(
        `Notificação do Mercado Pago recusada (${check.reason}); x-request-id=${safeForLog(requestId)}`,
      );
      throw new UnauthorizedException('Assinatura inválida');
    }
    return true;
  }
}
