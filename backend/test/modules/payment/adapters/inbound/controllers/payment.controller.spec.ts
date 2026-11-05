import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { PaymentController } from '../../../../../../src/modules/payment/adapters/inbound/controllers/payment.controller.js';
import { MercadoPagoWebhookController } from '../../../../../../src/modules/payment/adapters/inbound/controllers/mercadopago-webhook.controller.js';
import { MercadoPagoSignatureGuard } from '../../../../../../src/modules/payment/adapters/inbound/webhooks/mercadopago-signature.guard.js';
import {
  PAYMENT_SERVICE,
  type PaymentServicePort,
} from '../../../../../../src/modules/payment/application/ports/inbound/services/payment.service.port.js';

const PUBLIC_KEY = 'PUBLIC';
const session = {
  user: { id: 'user-1', email: 'comprador@example.com' },
} as unknown as UserSession;
const PAYMENT_ID = '0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';

describe('controllers de pagamento', () => {
  let service: MockPort<PaymentServicePort>;
  let payments: PaymentController;
  let webhook: MercadoPagoWebhookController;
  const reflector = new Reflector();

  beforeEach(async () => {
    service = {
      createCheckout: vi.fn(),
      getPayment: vi.fn(),
      handleProviderNotification: vi.fn().mockResolvedValue('confirmed'),
    };
    const module = await Test.createTestingModule({
      controllers: [PaymentController, MercadoPagoWebhookController],
      providers: [{ provide: PAYMENT_SERVICE, useValue: service }],
    })
      // o guard é testado à parte; aqui só importa que ele está aplicado na rota
      .overrideGuard(MercadoPagoSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();
    payments = module.get(PaymentController);
    webhook = module.get(MercadoPagoWebhookController);
  });

  describe('PaymentController', () => {
    it('checkout usa o usuário e o e-mail da sessão e o ticket_id do body', async () => {
      const checkout = {
        payment_id: PAYMENT_ID,
        checkout_url: 'https://www.mercadopago.com.br/x',
        expires_at: new Date(),
      };
      service.createCheckout.mockResolvedValue(checkout);

      await expect(
        payments.createCheckout(session, { ticket_id: 7 }),
      ).resolves.toBe(checkout);
      expect(service.createCheckout).toHaveBeenCalledWith(
        { id: 'user-1', email: 'comprador@example.com' },
        7,
      );
    });

    it('GET /payments/:id consulta como o usuário da sessão', async () => {
      await payments.getPayment(session, PAYMENT_ID);
      expect(service.getPayment).toHaveBeenCalledWith('user-1', PAYMENT_ID);
    });

    it.each([
      ['createCheckout', 'checkout', RequestMethod.POST],
      ['getPayment', ':id', RequestMethod.GET],
    ] as const)('%s exige sessão e é mapeado em %s', (method, path, verb) => {
      const handler = handlerOf(PaymentController, method);
      expect(reflector.get(PUBLIC_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
    });

    it('está em /payments e não é pública como um todo', () => {
      expect(Reflect.getMetadata(PATH_METADATA, PaymentController)).toBe(
        'payments',
      );
      expect(reflector.get(PUBLIC_KEY, PaymentController)).toBeUndefined();
    });
  });

  describe('MercadoPagoWebhookController', () => {
    it('repassa só o data.id da query (o corpo é ignorado) e responde received', async () => {
      await expect(
        webhook.receive({ 'data.id': 'ORD1', type: 'order' }),
      ).resolves.toEqual({ received: true });
      expect(service.handleProviderNotification).toHaveBeenCalledWith('ORD1');
    });

    it('sem type também processa (o estado vem da API de qualquer forma)', async () => {
      await webhook.receive({ 'data.id': 'ORD1' });
      expect(service.handleProviderNotification).toHaveBeenCalledWith('ORD1');
    });

    it('outro tópico: 200 sem processar', async () => {
      await expect(
        webhook.receive({ 'data.id': '123', type: 'payment' }),
      ).resolves.toEqual({ received: true });
      expect(service.handleProviderNotification).not.toHaveBeenCalled();
    });

    it('erro do service propaga (ex.: 503 para o Mercado Pago reenviar)', async () => {
      const failure = new Error('indisponível');
      service.handleProviderNotification.mockRejectedValue(failure);
      await expect(
        webhook.receive({ 'data.id': 'ORD1', type: 'order' }),
      ).rejects.toBe(failure);
    });

    it('é pública (sem sessão), protegida pelo guard de assinatura e responde 200', () => {
      const handler = handlerOf(MercadoPagoWebhookController, 'receive');
      expect(reflector.get(PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        MercadoPagoSignatureGuard,
      ]);
      expect(
        Reflect.getMetadata(PATH_METADATA, MercadoPagoWebhookController),
      ).toBe('webhooks');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('mercadopago');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    });
  });
});
