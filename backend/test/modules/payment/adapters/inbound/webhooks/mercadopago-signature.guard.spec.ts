import { createHmac } from 'node:crypto';
import {
  Logger,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MockPort } from '../../../../../utils/mocks.js';
import { MercadoPagoSignatureGuard } from '../../../../../../src/modules/payment/adapters/inbound/webhooks/mercadopago-signature.guard.js';
import type { PaymentMetricsPort } from '../../../../../../src/modules/payment/application/ports/outbound/metrics/payment-metrics.port.js';

const SECRET = 'segredo';
const ORDER_ID = 'ORDTST01';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const contextFor = (
  headers: Record<string, string>,
  query: Record<string, string>,
) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers, query }) }),
  }) as unknown as ExecutionContext;

const signedHeaders = (requestId = 'req-1') => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac('sha256', SECRET)
    .update(`id:${ORDER_ID.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
};

describe('MercadoPagoSignatureGuard', () => {
  let metrics: MockPort<PaymentMetricsPort>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    metrics = {
      checkoutOpened: vi.fn(),
      paymentConfirmed: vi.fn(),
      paymentRejected: vi.fn(),
      paymentRefunded: vi.fn(),
      paymentNotApproved: vi.fn(),
      webhookRejected: vi.fn(),
    };
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('deixa passar a notificação assinada (data.id da query)', () => {
    const guard = new MercadoPagoSignatureGuard(
      config({ MP_WEBHOOK_SECRET: SECRET }),
      metrics,
    );
    expect(
      guard.canActivate(
        contextFor(signedHeaders(), { 'data.id': ORDER_ID, type: 'order' }),
      ),
    ).toBe(true);
    expect(metrics.webhookRejected).not.toHaveBeenCalled();
  });

  it('assinatura inválida: 401 e métrica com o motivo', () => {
    const guard = new MercadoPagoSignatureGuard(
      config({ MP_WEBHOOK_SECRET: SECRET }),
      metrics,
    );
    const headers = {
      ...signedHeaders(),
      'x-signature': `ts=1,v1=${'0'.repeat(64)}`,
    };

    expect(() =>
      guard.canActivate(contextFor(headers, { 'data.id': ORDER_ID })),
    ).toThrow(UnauthorizedException);
    expect(metrics.webhookRejected).toHaveBeenCalledExactlyOnceWith(
      'invalid_signature',
    );
  });

  it('assinatura de outra order (data.id trocado na query): 401', () => {
    const guard = new MercadoPagoSignatureGuard(
      config({ MP_WEBHOOK_SECRET: SECRET }),
      metrics,
    );
    expect(() =>
      guard.canActivate(contextFor(signedHeaders(), { 'data.id': 'ORDTST02' })),
    ).toThrow(UnauthorizedException);
  });

  it('sem segredo configurado: avisa no boot e recusa tudo', () => {
    const guard = new MercadoPagoSignatureGuard(
      config({ MP_WEBHOOK_SECRET: '' }),
      metrics,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('MP_WEBHOOK_SECRET'),
    );

    expect(() =>
      guard.canActivate(contextFor(signedHeaders(), { 'data.id': ORDER_ID })),
    ).toThrow(UnauthorizedException);
    expect(metrics.webhookRejected).toHaveBeenCalledExactlyOnceWith(
      'missing_secret',
    );
  });

  it('sem header: missing_signature', () => {
    const guard = new MercadoPagoSignatureGuard(
      config({ MP_WEBHOOK_SECRET: SECRET }),
      metrics,
    );
    expect(() =>
      guard.canActivate(contextFor({}, { 'data.id': ORDER_ID })),
    ).toThrow(UnauthorizedException);
    expect(metrics.webhookRejected).toHaveBeenCalledWith('missing_signature');
  });

  it('não leva caracteres de controle do x-request-id para o log', () => {
    const guard = new MercadoPagoSignatureGuard(
      config({ MP_WEBHOOK_SECRET: SECRET }),
      metrics,
    );
    const headers = {
      'x-request-id': 'abc\nFAKE LOG LINE',
      'x-signature': 'ts=1,v1=00',
    };
    expect(() =>
      guard.canActivate(contextFor(headers, { 'data.id': ORDER_ID })),
    ).toThrow();
    const logged = String(warn.mock.calls.at(-1)?.[0]);
    expect(logged).not.toContain('\n');
    expect(logged).toContain('x-request-id=abcFAKELOGLINE');
  });

  it('MP_WEBHOOK_TOLERANCE_SECONDS inválido impede a API de subir', () => {
    expect(
      () =>
        new MercadoPagoSignatureGuard(
          config({
            MP_WEBHOOK_SECRET: SECRET,
            MP_WEBHOOK_TOLERANCE_SECONDS: '-5',
          }),
          metrics,
        ),
    ).toThrow(/MP_WEBHOOK_TOLERANCE_SECONDS/);
  });
});
