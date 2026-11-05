import type { Mock } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  MercadoPagoGateway,
  NOT_ALLOWED_PAYMENT_TYPES,
  amountToCents,
  centsToAmount,
  isAllowedCheckoutUrl,
  isoDurationUntil,
  toProviderStatus,
} from '../../../../../../src/modules/payment/adapters/outbound/gateways/mercadopago.gateway.js';
import {
  PaymentGatewayRejectedError,
  PaymentGatewayUnavailableError,
  type CreateCheckoutRequest,
} from '../../../../../../src/modules/payment/application/ports/outbound/gateways/payment-gateway.port.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const PAYMENT_ID = '0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const TOKEN = 'APP_USR-token-de-teste';
const CHECKOUT_URL =
  'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTST01';

const configWith = (values: Record<string, string | undefined>) =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`faltou ${key}`);
      return value;
    },
  }) as unknown as ConfigService;

const BASE_ENV = {
  MP_ACCESS_TOKEN: TOKEN,
  FRONTEND_URL: 'http://localhost:3001/',
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const checkoutRequest = (
  overrides: Partial<CreateCheckoutRequest> = {},
): CreateCheckoutRequest => ({
  paymentId: PAYMENT_ID,
  ticketId: 7,
  title: 'Ingresso: Show de Rock',
  amountCents: 5000,
  currency: 'BRL',
  payerEmail: 'comprador@example.com',
  expiresAt: new Date(NOW.getTime() + 4 * 60_000 + 30_000),
  ...overrides,
});

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'ORDTST01',
  status: 'processed',
  status_detail: 'accredited',
  external_reference: PAYMENT_ID,
  total_amount: '50.00',
  total_paid_amount: '50.00',
  currency: 'BRL',
  checkout_url: CHECKOUT_URL,
  transactions: {
    payments: [{ id: 'PAY01', status: 'processed', amount: '50.00' }],
  },
  ...overrides,
});

describe('MercadoPagoGateway', () => {
  let fetchMock: Mock<typeof fetch>;
  let gateway: MercadoPagoGateway;
  let warn: ReturnType<typeof vi.spyOn>;

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    gateway = new MercadoPagoGateway(configWith(BASE_ENV));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createCheckout', () => {
    it('envia a order de Checkout Pro com valor, referência, expiração e URLs de retorno', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(201, order({ status: 'created' })),
      );

      await expect(gateway.createCheckout(checkoutRequest())).resolves.toEqual({
        providerOrderId: 'ORDTST01',
        checkoutUrl: CHECKOUT_URL,
      });

      const { url, init, headers } = lastCall();
      expect(url).toBe('https://api.mercadopago.com/v1/orders');
      expect(init.method).toBe('POST');
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
      // idempotência: o mesmo pagamento nunca vira duas orders
      expect(headers['X-Idempotency-Key']).toBe(PAYMENT_ID);
      expect(headers['Content-Type']).toBe('application/json');
      expect(init.signal).toBeInstanceOf(AbortSignal);

      const returnUrl = (path: string) =>
        `http://localhost:3001/payment/${path}?payment_id=${PAYMENT_ID}`;
      expect(JSON.parse(init.body as string)).toEqual({
        type: 'online',
        processing_mode: 'manual',
        total_amount: '50.00',
        external_reference: PAYMENT_ID,
        expiration_time: 'PT4M30S',
        description: 'Ingresso: Show de Rock',
        payer: { email: 'comprador@example.com' },
        items: [
          {
            title: 'Ingresso: Show de Rock',
            unit_price: '50.00',
            quantity: 1,
            external_code: 'ticket-7',
          },
        ],
        config: {
          online: {
            success_url: returnUrl('success'),
            failure_url: returnUrl('failure'),
            pending_url: returnUrl('pending'),
            auto_return: 'all',
          },
          payment_method: { not_allowed_types: NOT_ALLOWED_PAYMENT_TYPES },
        },
      });
    });

    it('sem e-mail não envia payer; usa MP_API_BASE_URL quando configurada', async () => {
      gateway = new MercadoPagoGateway(
        configWith({ ...BASE_ENV, MP_API_BASE_URL: 'http://mp.local/' }),
      );
      fetchMock.mockResolvedValue(
        jsonResponse(201, order({ status: 'created' })),
      );

      await gateway.createCheckout(checkoutRequest({ payerEmail: undefined }));

      const { url, init } = lastCall();
      expect(url).toBe('http://mp.local/v1/orders');
      expect(JSON.parse(init.body as string)).not.toHaveProperty('payer');
    });

    it.each([
      [
        'checkout_url fora do Mercado Pago',
        order({ checkout_url: 'https://evil.example.com/pay' }),
      ],
      [
        'checkout_url sem https',
        order({ checkout_url: 'http://www.mercadopago.com.br/x' }),
      ],
      ['sem id', order({ id: undefined })],
    ])('resposta inválida (%s) é recusada', async (_caso, body) => {
      fetchMock.mockResolvedValue(jsonResponse(201, body));
      await expect(
        gateway.createCheckout(checkoutRequest()),
      ).rejects.toBeInstanceOf(PaymentGatewayRejectedError);
    });

    it('moeda diferente de BRL nem chega ao provedor', async () => {
      await expect(
        gateway.createCheckout(checkoutRequest({ currency: 'USD' })),
      ).rejects.toBeInstanceOf(PaymentGatewayRejectedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sem MP_ACCESS_TOKEN: recusa sem chamar a rede', async () => {
      gateway = new MercadoPagoGateway(
        configWith({ FRONTEND_URL: 'http://localhost:3001' }),
      );
      await expect(
        gateway.createCheckout(checkoutRequest()),
      ).rejects.toMatchObject({ code: 'not_configured' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('nunca coloca o token nos logs', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { errors: [{ code: 'invalid_credentials' }] }),
      );
      await expect(
        gateway.createCheckout(checkoutRequest()),
      ).rejects.toBeInstanceOf(PaymentGatewayRejectedError);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
      expect(JSON.stringify(warn.mock.calls)).toContain('invalid_credentials');
    });
  });

  describe('erros HTTP', () => {
    it.each([
      [
        'falha de rede',
        () => fetchMock.mockRejectedValue(new TypeError('fetch failed')),
      ],
      [
        'timeout',
        () =>
          fetchMock.mockRejectedValue(
            new DOMException('timeout', 'TimeoutError'),
          ),
      ],
      [
        '500',
        () =>
          fetchMock.mockResolvedValue(
            jsonResponse(500, { errors: [{ code: 'internal_error' }] }),
          ),
      ],
      [
        '429',
        () =>
          fetchMock.mockResolvedValue(
            jsonResponse(429, { errors: [{ code: 'too_many_requests' }] }),
          ),
      ],
    ])('%s é transitório', async (_caso, arrange) => {
      arrange();
      await expect(gateway.getOrder('ORDTST01')).rejects.toBeInstanceOf(
        PaymentGatewayUnavailableError,
      );
    });

    it('4xx é recusa, com o código do Mercado Pago', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { errors: [{ code: 'unauthorized' }] }),
      );
      await expect(gateway.getOrder('ORDTST01')).rejects.toMatchObject({
        name: 'PaymentGatewayRejectedError',
        code: 'unauthorized',
      });
    });
  });

  describe('getOrder', () => {
    it('consulta a order e traduz para o vocabulário do domínio', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, order()));

      await expect(gateway.getOrder('ORDTST01')).resolves.toEqual({
        providerOrderId: 'ORDTST01',
        externalReference: PAYMENT_ID,
        status: 'approved',
        providerPaymentId: 'PAY01',
        amountCents: 5000,
        currency: 'BRL',
      });
      const { url, init, headers } = lastCall();
      expect(url).toBe('https://api.mercadopago.com/v1/orders/ORDTST01');
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(headers).not.toHaveProperty('X-Idempotency-Key');
    });

    it('404: null', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { errors: [{ code: 'order_not_found' }] }),
      );
      await expect(gateway.getOrder('ORDTST01')).resolves.toBeNull();
    });

    it('400 invalid_path_param (id que o Mercado Pago não aceita): null', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, { errors: [{ code: 'invalid_path_param' }] }),
      );
      await expect(gateway.getOrder('ORDTST01SIMULACAO')).resolves.toBeNull();
    });

    it('outro 400 continua sendo recusa', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, { errors: [{ code: 'bad_request' }] }),
      );
      await expect(gateway.getOrder('ORDTST01')).rejects.toBeInstanceOf(
        PaymentGatewayRejectedError,
      );
    });

    it('id com caracteres inválidos: null sem chamar a rede (nada de path injection)', async () => {
      await expect(gateway.getOrder('../payments/1')).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resposta sem valor válido é recusada', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, order({ total_amount: '50,00' })),
      );
      await expect(gateway.getOrder('ORDTST01')).rejects.toBeInstanceOf(
        PaymentGatewayRejectedError,
      );
    });

    it('sem transações: providerPaymentId null', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          200,
          order({ status: 'created', transactions: undefined }),
        ),
      );
      await expect(gateway.getOrder('ORDTST01')).resolves.toMatchObject({
        status: 'pending',
        providerPaymentId: null,
      });
    });
  });

  describe('refund', () => {
    it('estorno total: POST com corpo vazio e chave de idempotência nova', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(201, order({ status: 'refunded' })),
      );

      await gateway.refund('ORDTST01');
      await gateway.refund('ORDTST01');

      const [first, second] = fetchMock.mock.calls as [string, RequestInit][];
      expect(first[0]).toBe(
        'https://api.mercadopago.com/v1/orders/ORDTST01/refund',
      );
      expect(first[1].method).toBe('POST');
      expect(first[1].body).toBe('{}');
      const keyOf = (init: RequestInit) =>
        (init.headers as Record<string, string>)['X-Idempotency-Key'];
      expect(keyOf(first[1])).toMatch(/^[0-9a-f-]{36}$/);
      expect(keyOf(first[1])).not.toBe(keyOf(second[1]));
    });

    it.each(['order_already_refunded', 'order_refund_already_in_process'])(
      '409 %s conta como sucesso (idempotente)',
      async (code) => {
        fetchMock.mockResolvedValue(jsonResponse(409, { errors: [{ code }] }));
        await expect(gateway.refund('ORDTST01')).resolves.toBeUndefined();
      },
    );

    it('outra recusa propaga', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { errors: [{ code: 'cannot_refund_order' }] }),
      );
      await expect(gateway.refund('ORDTST01')).rejects.toMatchObject({
        code: 'cannot_refund_order',
      });
    });
  });

  describe('configuração', () => {
    it.each(['0', '-1', 'abc', '15001'])(
      'MP_HTTP_TIMEOUT_MS=%s impede a API de subir',
      (value) => {
        expect(
          () =>
            new MercadoPagoGateway(
              configWith({ ...BASE_ENV, MP_HTTP_TIMEOUT_MS: value }),
            ),
        ).toThrow(/MP_HTTP_TIMEOUT_MS/);
      },
    );
  });
});

describe('funções auxiliares do gateway', () => {
  it.each([
    [1, '0.01'],
    [100, '1.00'],
    [5050, '50.50'],
    [10_000_000, '100000.00'],
  ])('centsToAmount(%d) = %s', (cents, amount) => {
    expect(centsToAmount(cents)).toBe(amount);
    expect(amountToCents(amount)).toBe(cents);
  });

  it.each([0, -1, 1.5])('centsToAmount recusa %d', (cents) => {
    expect(() => centsToAmount(cents)).toThrow();
  });

  it.each([
    ['50', 5000],
    ['50.5', 5050],
    ['50,00', null],
    ['-1.00', null],
    ['1.001', null],
    [undefined, null],
  ])('amountToCents(%j) = %j', (amount, cents) => {
    expect(amountToCents(amount)).toBe(cents);
  });

  it.each([
    [270_000, 'PT4M30S'],
    [300_000, 'PT5M'],
    [45_000, 'PT45S'],
    [45_999, 'PT45S'],
  ])('isoDurationUntil(+%dms) = %s', (ms, duration) => {
    expect(isoDurationUntil(new Date(NOW.getTime() + ms), NOW)).toBe(duration);
  });

  it('isoDurationUntil recusa prazo vencido', () => {
    expect(() => isoDurationUntil(new Date(NOW.getTime() + 999), NOW)).toThrow(
      PaymentGatewayRejectedError,
    );
  });

  it.each([
    ['https://www.mercadopago.com.br/checkout/v1/redirect?order_id=1', true],
    ['https://mercadopago.com/x', true],
    ['https://www.mercadopago.com.br.evil.com/x', false],
    ['https://evilmercadopago.com.br/x', false],
    ['javascript:alert(1)', false],
    [123, false],
  ])('isAllowedCheckoutUrl(%j) = %s', (url, allowed) => {
    expect(isAllowedCheckoutUrl(url)).toBe(allowed);
  });

  it.each([
    ['created', 'pending'],
    ['action_required', 'pending'],
    ['processing', 'pending'],
    ['processed', 'approved'],
    ['failed', 'rejected'],
    ['canceled', 'cancelled'],
    ['expired', 'expired'],
    ['refunded', 'refunded'],
    ['charged_back', 'charged_back'],
    ['status_novo', 'pending'],
    ['toString', 'pending'],
  ])('toProviderStatus(%s) = %s', (status, expected) => {
    expect(toProviderStatus(status)).toBe(expected);
  });
});
