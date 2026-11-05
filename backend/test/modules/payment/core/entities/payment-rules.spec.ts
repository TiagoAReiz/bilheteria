import {
  CHECKOUT_CREATION_GRACE_MS,
  MIN_CHECKOUT_WINDOW_MS,
  checkoutBlocker,
  decideApproval,
  decidePendingCheckout,
  reservationDeadline,
  type CheckoutTicket,
  type TicketSnapshot,
} from '../../../../../src/modules/payment/core/entities/payment-rules.js';
import {
  toPaymentView,
  type Payment,
} from '../../../../../src/modules/payment/core/entities/payment.entity.js';
import { RESERVATION_TTL_MINUTES } from '../../../../../src/modules/ticket/core/entities/reservation.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;
const RESERVED_AT = new Date(NOW.getTime() - 60_000); // reservado há 1 minuto
const DEADLINE = new Date(RESERVED_AT.getTime() + TTL_MS);

const makeTicket = (
  overrides: Partial<CheckoutTicket> = {},
): CheckoutTicket => ({
  id: 1,
  user_id: 'user-1',
  reserved_at: RESERVED_AT,
  is_paid: false,
  event_id: 10,
  event_name: 'Show',
  price_cents: 5000,
  event_starts_at: new Date(NOW.getTime() + 86_400_000),
  event_deleted: false,
  ...overrides,
});

const makePayment = (overrides: Partial<Payment> = {}): Payment => ({
  id: '0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f',
  ticket_id: 1,
  user_id: 'user-1',
  amount_cents: 5000,
  currency: 'BRL',
  status: 'pending',
  provider: 'mercadopago',
  provider_order_id: 'ORD1',
  provider_payment_id: null,
  checkout_url:
    'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1',
  expires_at: DEADLINE,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

describe('payment-rules', () => {
  it('reservationDeadline usa o mesmo TTL do módulo ticket', () => {
    expect(reservationDeadline(RESERVED_AT)).toEqual(DEADLINE);
  });

  describe('checkoutBlocker', () => {
    it('libera o dono com reserva válida e evento à venda', () => {
      expect(checkoutBlocker(makeTicket(), 'user-1', NOW)).toBeUndefined();
    });

    it('wrong_owner tem prioridade: não revela se o ticket de outra pessoa está pago', () => {
      expect(
        checkoutBlocker(
          makeTicket({ user_id: 'other', is_paid: true }),
          'user-1',
          NOW,
        ),
      ).toBe('wrong_owner');
      expect(
        checkoutBlocker(makeTicket({ user_id: null }), 'user-1', NOW),
      ).toBe('wrong_owner');
    });

    it('already_paid quando o próprio ticket já foi pago', () => {
      expect(
        checkoutBlocker(makeTicket({ is_paid: true }), 'user-1', NOW),
      ).toBe('already_paid');
    });

    it.each([
      ['sem reserva', { reserved_at: null }],
      [
        'reserva vencida',
        { reserved_at: new Date(NOW.getTime() - TTL_MS - 1) },
      ],
      [
        'menos que a janela mínima restante',
        {
          reserved_at: new Date(
            NOW.getTime() - TTL_MS + MIN_CHECKOUT_WINDOW_MS - 1,
          ),
        },
      ],
    ])('expired: %s', (_caso, overrides: Partial<CheckoutTicket>) => {
      expect(checkoutBlocker(makeTicket(overrides), 'user-1', NOW)).toBe(
        'expired',
      );
    });

    it('aceita exatamente a janela mínima restante', () => {
      const ticket = makeTicket({
        reserved_at: new Date(NOW.getTime() - TTL_MS + MIN_CHECKOUT_WINDOW_MS),
      });
      expect(checkoutBlocker(ticket, 'user-1', NOW)).toBeUndefined();
    });

    it.each([
      ['evento sem preço (anterior ao pagamento)', { price_cents: null }],
      ['evento excluído', { event_deleted: true }],
      ['evento já começou', { event_starts_at: NOW }],
    ])('not_on_sale: %s', (_caso, overrides: Partial<CheckoutTicket>) => {
      expect(checkoutBlocker(makeTicket(overrides), 'user-1', NOW)).toBe(
        'not_on_sale',
      );
    });
  });

  describe('decidePendingCheckout', () => {
    it('sem pendentes: cria', () => {
      expect(decidePendingCheckout([], 'user-1', DEADLINE, NOW)).toEqual({
        action: 'create',
      });
    });

    it('reaproveita o checkout da mesma reserva com URL', () => {
      const pending = makePayment();
      expect(decidePendingCheckout([pending], 'user-1', DEADLINE, NOW)).toEqual(
        {
          action: 'reuse',
          payment: pending,
        },
      );
    });

    it('não reaproveita checkout de outra reserva (outro fim) nem de outro usuário', () => {
      const oldReservation = makePayment({
        expires_at: new Date(DEADLINE.getTime() - 1000),
      });
      const otherUser = makePayment({ user_id: 'other' });
      expect(
        decidePendingCheckout(
          [oldReservation, otherUser],
          'user-1',
          DEADLINE,
          NOW,
        ),
      ).toEqual({ action: 'create' });
    });

    it('espera enquanto o checkout da mesma reserva ainda está sendo criado', () => {
      const inFlight = makePayment({
        checkout_url: null,
        created_at: new Date(NOW.getTime() - CHECKOUT_CREATION_GRACE_MS + 1),
      });
      expect(
        decidePendingCheckout([inFlight], 'user-1', DEADLINE, NOW),
      ).toEqual({ action: 'wait' });
    });

    it('descarta um checkout sem URL abandonado (passou do grace) e cria outro', () => {
      const abandoned = makePayment({
        checkout_url: null,
        created_at: new Date(NOW.getTime() - CHECKOUT_CREATION_GRACE_MS),
      });
      expect(
        decidePendingCheckout([abandoned], 'user-1', DEADLINE, NOW),
      ).toEqual({ action: 'create' });
    });
  });

  describe('decideApproval', () => {
    const ticket: TicketSnapshot = {
      id: 1,
      user_id: 'user-1',
      reserved_at: RESERVED_AT,
      is_paid: false,
    };
    const charged = { amountCents: 5000, currency: 'BRL' };

    it('confirma: mesma reserva, mesmo dono, dentro do prazo, valor certo', () => {
      expect(decideApproval(ticket, makePayment(), charged, NOW)).toEqual({
        action: 'confirm',
      });
    });

    it('confirma exatamente no fim da reserva', () => {
      expect(decideApproval(ticket, makePayment(), charged, DEADLINE)).toEqual({
        action: 'confirm',
      });
    });

    it.each([
      ['valor diferente', { amountCents: 4999, currency: 'BRL' }],
      ['moeda diferente', { amountCents: 5000, currency: 'USD' }],
    ])('amount_mismatch: %s', (_caso, wrong) => {
      expect(decideApproval(ticket, makePayment(), wrong, NOW)).toEqual({
        action: 'refund',
        reason: 'amount_mismatch',
      });
    });

    it('already_paid quando outro pagamento já pagou o ticket', () => {
      expect(
        decideApproval(
          { ...ticket, is_paid: true },
          makePayment(),
          charged,
          NOW,
        ),
      ).toEqual({
        action: 'refund',
        reason: 'already_paid',
      });
    });

    it('wrong_owner quando o ticket foi reservado por outra pessoa', () => {
      expect(
        decideApproval(
          { ...ticket, user_id: 'other' },
          makePayment(),
          charged,
          NOW,
        ),
      ).toEqual({
        action: 'refund',
        reason: 'wrong_owner',
      });
    });

    it('expired quando pagou depois do fim da reserva', () => {
      expect(
        decideApproval(
          ticket,
          makePayment(),
          charged,
          new Date(DEADLINE.getTime() + 1),
        ),
      ).toEqual({ action: 'refund', reason: 'expired' });
    });

    it('expired quando o mesmo usuário reservou de novo (a reserva paga não existe mais)', () => {
      const reReserved = {
        ...ticket,
        reserved_at: new Date(NOW.getTime() - 1000),
      };
      expect(decideApproval(reReserved, makePayment(), charged, NOW)).toEqual({
        action: 'refund',
        reason: 'expired',
      });
    });
  });

  describe('toPaymentView', () => {
    it('não expõe ids do provedor e só mostra a URL enquanto pendente', () => {
      const view = toPaymentView(makePayment({ provider_payment_id: 'PAY1' }));
      expect(view).not.toHaveProperty('provider_order_id');
      expect(view).not.toHaveProperty('provider_payment_id');
      expect(view).not.toHaveProperty('user_id');
      expect(view.checkout_url).toContain('mercadopago.com.br');
      expect(
        toPaymentView(makePayment({ status: 'approved' })).checkout_url,
      ).toBeNull();
    });
  });
});
