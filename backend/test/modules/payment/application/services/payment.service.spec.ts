import {
  BadGatewayException,
  Logger,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { PaymentService } from '../../../../../src/modules/payment/application/services/payment.service.js';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayRejectedError,
  PaymentGatewayUnavailableError,
  type PaymentGatewayPort,
  type ProviderOrder,
} from '../../../../../src/modules/payment/application/ports/outbound/gateways/payment-gateway.port.js';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepositoryPort,
} from '../../../../../src/modules/payment/application/ports/outbound/repositories/payment.repository.port.js';
import {
  PAYMENT_METRICS,
  type PaymentMetricsPort,
} from '../../../../../src/modules/payment/application/ports/outbound/metrics/payment-metrics.port.js';
import {
  TRACING,
  type ActiveSpan,
  type TracingPort,
} from '../../../../../src/modules/observability/application/ports/outbound/tracing/tracing.port.js';
import type { Payment } from '../../../../../src/modules/payment/core/entities/payment.entity.js';
import type { CheckoutTicket } from '../../../../../src/modules/payment/core/entities/payment-rules.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const PAYMENT_ID = '0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const CHECKOUT_URL =
  'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1';
const payer = { id: 'user-1', email: 'comprador@example.com' };

const makePayment = (overrides: Partial<Payment> = {}): Payment => ({
  id: PAYMENT_ID,
  ticket_id: 7,
  user_id: 'user-1',
  amount_cents: 5000,
  currency: 'BRL',
  status: 'pending',
  provider: 'mercadopago',
  provider_order_id: 'ORD1',
  provider_payment_id: null,
  checkout_url: CHECKOUT_URL,
  expires_at: new Date(NOW.getTime() + 4 * 60_000),
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const ticket: CheckoutTicket = {
  id: 7,
  user_id: 'user-1',
  reserved_at: NOW,
  is_paid: false,
  event_id: 10,
  event_name: 'Show de Rock',
  price_cents: 5000,
  event_starts_at: new Date(NOW.getTime() + 86_400_000),
  event_sales_starts_at: null,
  event_deleted: false,
};

const makeOrder = (overrides: Partial<ProviderOrder> = {}): ProviderOrder => ({
  providerOrderId: 'ORD1',
  externalReference: PAYMENT_ID,
  status: 'approved',
  providerPaymentId: 'PAY1',
  amountCents: 5000,
  currency: 'BRL',
  ...overrides,
});

describe('PaymentService', () => {
  let service: PaymentService;
  let repository: MockPort<PaymentRepositoryPort>;
  let gateway: MockPort<PaymentGatewayPort>;
  let metrics: MockPort<PaymentMetricsPort>;
  let tracing: MockPort<TracingPort>;
  let span: MockPort<ActiveSpan>;

  beforeEach(async () => {
    // logs do service (warn/error) são esperados em vários cenários; não poluem a saída
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    repository = {
      openCheckout: vi.fn(),
      attachCheckout: vi.fn(),
      markCheckoutFailed: vi.fn(),
      findById: vi.fn().mockResolvedValue(makePayment()),
      settleApproved: vi.fn(),
      markRefunded: vi.fn().mockResolvedValue(true),
      markNotApproved: vi.fn().mockResolvedValue(true),
    };
    gateway = {
      provider: 'mercadopago',
      createCheckout: vi.fn().mockResolvedValue({
        providerOrderId: 'ORD1',
        checkoutUrl: CHECKOUT_URL,
      }),
      getOrder: vi.fn().mockResolvedValue(makeOrder()),
      refund: vi.fn().mockResolvedValue(undefined),
    };
    metrics = {
      checkoutOpened: vi.fn(),
      paymentConfirmed: vi.fn(),
      paymentRejected: vi.fn(),
      paymentRefunded: vi.fn(),
      paymentNotApproved: vi.fn(),
      webhookRejected: vi.fn(),
    };
    span = { setAttributes: vi.fn() };
    tracing = {
      inSpan: vi.fn((_name, _attributes, work) =>
        work(span),
      ) as MockPort<TracingPort>['inSpan'],
    };

    const module = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PAYMENT_REPOSITORY, useValue: repository },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: PAYMENT_METRICS, useValue: metrics },
        { provide: TRACING, useValue: tracing },
      ],
    }).compile();
    service = module.get(PaymentService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('createCheckout', () => {
    it('cria o pedido no provedor com o valor do evento, a referência e o fim da reserva', async () => {
      const payment = makePayment({
        provider_order_id: null,
        checkout_url: null,
      });
      repository.openCheckout.mockResolvedValue({
        outcome: 'created',
        payment,
        ticket,
      });
      repository.attachCheckout.mockResolvedValue(makePayment());

      await expect(service.createCheckout(payer, 7)).resolves.toEqual({
        payment_id: PAYMENT_ID,
        checkout_url: CHECKOUT_URL,
        expires_at: payment.expires_at,
      });

      expect(repository.openCheckout).toHaveBeenCalledWith({
        ticketId: 7,
        userId: 'user-1',
        provider: 'mercadopago',
        currency: 'BRL',
      });
      expect(gateway.createCheckout).toHaveBeenCalledWith({
        paymentId: PAYMENT_ID,
        ticketId: 7,
        title: 'Ingresso: Show de Rock',
        amountCents: 5000,
        currency: 'BRL',
        payerEmail: 'comprador@example.com',
        expiresAt: payment.expires_at,
      });
      expect(repository.attachCheckout).toHaveBeenCalledWith(
        PAYMENT_ID,
        'ORD1',
        CHECKOUT_URL,
      );
      expect(metrics.checkoutOpened).toHaveBeenCalledExactlyOnceWith('created');
      expect(tracing.inSpan).toHaveBeenCalledWith(
        'payment.checkout',
        { 'ticket.id': 7 },
        expect.any(Function),
      );
    });

    it('reaproveita o checkout pendente da mesma reserva sem chamar o provedor (idempotência)', async () => {
      const pending = makePayment() as Payment & { checkout_url: string };
      repository.openCheckout.mockResolvedValue({
        outcome: 'reused',
        payment: pending,
      });

      await expect(service.createCheckout(payer, 7)).resolves.toEqual({
        payment_id: PAYMENT_ID,
        checkout_url: CHECKOUT_URL,
        expires_at: pending.expires_at,
      });
      expect(gateway.createCheckout).not.toHaveBeenCalled();
      expect(metrics.checkoutOpened).toHaveBeenCalledExactlyOnceWith('reused');
    });

    it.each([
      ['ticket_not_found', NotFoundException],
      ['wrong_owner', ForbiddenException],
      ['already_paid', ConflictException],
      ['expired', ConflictException],
      ['not_on_sale', ConflictException],
    ] as const)(
      'bloqueio %s vira %s sem chamar o provedor',
      async (reason, exception) => {
        repository.openCheckout.mockResolvedValue({
          outcome: 'blocked',
          reason,
        });

        await expect(service.createCheckout(payer, 7)).rejects.toBeInstanceOf(
          exception,
        );
        expect(gateway.createCheckout).not.toHaveBeenCalled();
        expect(metrics.checkoutOpened).not.toHaveBeenCalled();
      },
    );

    it('mensagens claras para reserva expirada e ticket já pago', async () => {
      repository.openCheckout.mockResolvedValue({
        outcome: 'blocked',
        reason: 'expired',
      });
      await expect(service.createCheckout(payer, 7)).rejects.toThrow(
        /Reserve o ingresso de novo/,
      );
      repository.openCheckout.mockResolvedValue({
        outcome: 'blocked',
        reason: 'already_paid',
      });
      await expect(service.createCheckout(payer, 7)).rejects.toThrow(
        /já está pago/,
      );
    });

    it('checkout em criação por outra requisição: 409 para tentar de novo', async () => {
      repository.openCheckout.mockResolvedValue({ outcome: 'in_progress' });
      await expect(service.createCheckout(payer, 7)).rejects.toThrow(
        /já está sendo criado/,
      );
    });

    it.each([
      [
        new PaymentGatewayUnavailableError('timeout'),
        ServiceUnavailableException,
      ],
      [
        new PaymentGatewayRejectedError('401', 'unauthorized'),
        BadGatewayException,
      ],
    ])(
      'falha do provedor (%s) cancela o pendente e responde %s',
      async (failure, exception) => {
        repository.openCheckout.mockResolvedValue({
          outcome: 'created',
          payment: makePayment({ checkout_url: null }),
          ticket,
        });
        gateway.createCheckout.mockRejectedValue(failure);

        await expect(service.createCheckout(payer, 7)).rejects.toBeInstanceOf(
          exception,
        );
        expect(repository.markCheckoutFailed).toHaveBeenCalledWith(PAYMENT_ID);
        expect(repository.attachCheckout).not.toHaveBeenCalled();
        expect(metrics.checkoutOpened).not.toHaveBeenCalled();
      },
    );

    it('409 se o pendente deixou de valer enquanto o provedor respondia', async () => {
      repository.openCheckout.mockResolvedValue({
        outcome: 'created',
        payment: makePayment({ checkout_url: null }),
        ticket,
      });
      repository.attachCheckout.mockResolvedValue(null);

      await expect(service.createCheckout(payer, 7)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('getPayment', () => {
    it('devolve a visão do dono, sem ids do provedor', async () => {
      const view = await service.getPayment('user-1', PAYMENT_ID);
      expect(view).toMatchObject({
        id: PAYMENT_ID,
        status: 'pending',
        amount_cents: 5000,
      });
      expect(view).not.toHaveProperty('provider_order_id');
    });

    it('pagamento de outro usuário responde 404 (não confirma que existe)', async () => {
      await expect(
        service.getPayment('intruso', PAYMENT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('inexistente: 404', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.getPayment('user-1', PAYMENT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('handleProviderNotification', () => {
    it('aprovado com reserva válida: confirma e conta a métrica', async () => {
      repository.settleApproved.mockResolvedValue({
        outcome: 'confirmed',
        payment: makePayment({ status: 'approved' }),
      });

      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'confirmed',
      );

      // nunca confia no corpo: o estado vem do provedor
      expect(gateway.getOrder).toHaveBeenCalledWith('ORD1');
      expect(repository.findById).toHaveBeenCalledWith(PAYMENT_ID);
      expect(repository.settleApproved).toHaveBeenCalledWith(
        PAYMENT_ID,
        { providerOrderId: 'ORD1', providerPaymentId: 'PAY1' },
        { amountCents: 5000, currency: 'BRL' },
      );
      expect(metrics.paymentConfirmed).toHaveBeenCalledTimes(1);
      expect(gateway.refund).not.toHaveBeenCalled();
      expect(span.setAttributes).toHaveBeenCalledWith({ outcome: 'confirmed' });
    });

    it.each(['already_approved', 'already_refunded', 'not_found'] as const)(
      'notificação repetida (%s): nada muda, sem métrica nem estorno',
      async (outcome) => {
        repository.settleApproved.mockResolvedValue({ outcome });

        await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
          'duplicate',
        );
        expect(metrics.paymentConfirmed).not.toHaveBeenCalled();
        expect(gateway.refund).not.toHaveBeenCalled();
      },
    );

    it.each([
      'expired',
      'wrong_owner',
      'already_paid',
      'amount_mismatch',
    ] as const)(
      'aprovado mas recusado (%s): estorna, marca refunded e registra as métricas',
      async (reason) => {
        repository.settleApproved.mockResolvedValue({
          outcome: 'refund_required',
          reason,
        });

        await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
          'refunded',
        );
        expect(gateway.refund).toHaveBeenCalledWith('ORD1');
        expect(repository.markRefunded).toHaveBeenCalledWith(PAYMENT_ID, {
          providerOrderId: 'ORD1',
          providerPaymentId: 'PAY1',
        });
        expect(metrics.paymentRejected).toHaveBeenCalledExactlyOnceWith(reason);
        expect(metrics.paymentRefunded).toHaveBeenCalledExactlyOnceWith(reason);
        expect(metrics.paymentConfirmed).not.toHaveBeenCalled();
      },
    );

    it('estorno com provedor fora do ar: 503 (o Mercado Pago reenvia) e não marca refunded', async () => {
      repository.settleApproved.mockResolvedValue({
        outcome: 'refund_required',
        reason: 'expired',
      });
      gateway.refund.mockRejectedValue(
        new PaymentGatewayUnavailableError('502'),
      );

      await expect(
        service.handleProviderNotification('ORD1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(repository.markRefunded).not.toHaveBeenCalled();
      expect(metrics.paymentRefunded).not.toHaveBeenCalled();
    });

    it('erro transitório ao consultar a order: 503 sem tocar no banco', async () => {
      gateway.getOrder.mockRejectedValue(
        new PaymentGatewayUnavailableError('timeout'),
      );

      await expect(
        service.handleProviderNotification('ORD1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.settleApproved).not.toHaveBeenCalled();
    });

    it.each([
      ['rejected', 'rejected'],
      ['cancelled', 'cancelled'],
      ['expired', 'expired'],
    ] as const)(
      'status %s no provedor: marca %s e conta a métrica',
      async (status, expected) => {
        gateway.getOrder.mockResolvedValue(
          makeOrder({ status, providerPaymentId: null }),
        );

        await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
          'not_approved',
        );
        expect(repository.markNotApproved).toHaveBeenCalledWith(
          PAYMENT_ID,
          expected,
          {
            providerOrderId: 'ORD1',
            providerPaymentId: null,
          },
        );
        expect(metrics.paymentNotApproved).toHaveBeenCalledExactlyOnceWith(
          expected,
        );
        expect(repository.settleApproved).not.toHaveBeenCalled();
      },
    );

    it('rejeição repetida: duplicate e sem métrica', async () => {
      gateway.getOrder.mockResolvedValue(makeOrder({ status: 'rejected' }));
      repository.markNotApproved.mockResolvedValue(false);

      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'duplicate',
      );
      expect(metrics.paymentNotApproved).not.toHaveBeenCalled();
    });

    it('pendente no provedor: não muda nada', async () => {
      gateway.getOrder.mockResolvedValue(makeOrder({ status: 'pending' }));

      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'pending',
      );
      expect(repository.settleApproved).not.toHaveBeenCalled();
      expect(repository.markNotApproved).not.toHaveBeenCalled();
    });

    it('estorno feito no provedor (ex.: depois do nosso estorno): marca refunded se ainda não estava', async () => {
      gateway.getOrder.mockResolvedValue(makeOrder({ status: 'refunded' }));
      repository.findById.mockResolvedValue(makePayment({ status: 'pending' }));
      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'refunded',
      );

      repository.markRefunded.mockResolvedValue(false);
      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'duplicate',
      );
    });

    it('estorno no painel de um pagamento aprovado: não mexe no ticket (revisão manual)', async () => {
      gateway.getOrder.mockResolvedValue(makeOrder({ status: 'refunded' }));
      repository.findById.mockResolvedValue(
        makePayment({ status: 'approved' }),
      );

      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'duplicate',
      );
      expect(repository.markRefunded).not.toHaveBeenCalled();
    });

    it.each([
      [
        'order desconhecida no provedor',
        () => gateway.getOrder.mockResolvedValue(null),
      ],
      [
        'sem referência nossa',
        () =>
          gateway.getOrder.mockResolvedValue(
            makeOrder({ externalReference: null }),
          ),
      ],
      [
        'referência que não é um uuid',
        () =>
          gateway.getOrder.mockResolvedValue(
            makeOrder({ externalReference: "1' OR '1'='1" }),
          ),
      ],
      [
        'pagamento inexistente',
        () => repository.findById.mockResolvedValue(null),
      ],
      [
        'order diferente da que criamos para o pagamento',
        () =>
          repository.findById.mockResolvedValue(
            makePayment({ provider_order_id: 'ORD-OUTRA' }),
          ),
      ],
      [
        'pagamento de outro provedor',
        () =>
          repository.findById.mockResolvedValue(
            makePayment({ provider: 'outro' }),
          ),
      ],
    ])('%s: ignora (200) sem mudar nada', async (_caso, arrange) => {
      arrange();

      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'ignored',
      );
      expect(repository.settleApproved).not.toHaveBeenCalled();
      expect(repository.markNotApproved).not.toHaveBeenCalled();
      expect(gateway.refund).not.toHaveBeenCalled();
    });

    it('aceita pagamento cujo id do provedor ainda não foi gravado (processo caiu no checkout)', async () => {
      repository.findById.mockResolvedValue(
        makePayment({ provider_order_id: null }),
      );
      repository.settleApproved.mockResolvedValue({
        outcome: 'confirmed',
        payment: makePayment({ status: 'approved' }),
      });

      await expect(service.handleProviderNotification('ORD1')).resolves.toBe(
        'confirmed',
      );
    });

    it('roda no span payment.notification com o id do pedido', async () => {
      repository.settleApproved.mockResolvedValue({
        outcome: 'already_approved',
      });
      await service.handleProviderNotification('ORD1');
      expect(tracing.inSpan).toHaveBeenCalledWith(
        'payment.notification',
        { 'provider.order_id': 'ORD1' },
        expect.any(Function),
      );
      expect(span.setAttributes).toHaveBeenCalledWith({
        'payment.id': PAYMENT_ID,
        'provider.status': 'approved',
      });
    });
  });
});
