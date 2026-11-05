import {
  EMAIL_CLAIM_LEASE_MS,
  MAX_EMAIL_ATTEMPTS,
  decideAfterFailure,
  retryDelayMs,
} from '../../../../../src/modules/notification/core/entities/email-retry.js';
import { ticketConfirmedEmail } from '../../../../../src/modules/notification/core/entities/email.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('ticketConfirmedEmail', () => {
  it('um email por pagamento: a dedupe key vem do id do pagamento', () => {
    const data = {
      userName: 'Maria',
      eventId: 1,
      eventName: 'Show',
      eventStartsAt: NOW.toISOString(),
      eventLocation: 'Arena',
      ticketId: 7,
      amountCents: 5000,
      currency: 'BRL',
    };
    expect(ticketConfirmedEmail('pay-1', 'm@example.com', data)).toEqual({
      kind: 'ticket_confirmed',
      to: 'm@example.com',
      dedupeKey: 'ticket-confirmed:pay-1',
      data,
    });
  });
});

describe('retryDelayMs', () => {
  it.each([
    [1, 30_000],
    [2, 120_000],
    [3, 480_000],
    [4, 1_920_000],
    [5, 7_680_000],
  ])('tentativa %i espera %i ms', (attempts, delay) => {
    expect(retryDelayMs(attempts)).toBe(delay);
  });

  it('tem teto de 6h', () => {
    expect(retryDelayMs(20)).toBe(6 * 60 * 60_000);
  });

  it('o lease cobre um envio lento sem a linha voltar antes da hora', () => {
    expect(EMAIL_CLAIM_LEASE_MS).toBe(5 * 60_000);
  });
});

describe('decideAfterFailure', () => {
  it('falha temporária agenda nova tentativa', () => {
    expect(decideAfterFailure(1, false, NOW)).toEqual({
      status: 'pending',
      nextAttemptAt: new Date(NOW.getTime() + 30_000),
    });
  });

  it('falha permanente desiste na hora', () => {
    expect(decideAfterFailure(1, true, NOW)).toEqual({ status: 'failed' });
  });

  it('desiste ao chegar no limite de tentativas', () => {
    expect(decideAfterFailure(MAX_EMAIL_ATTEMPTS - 1, false, NOW).status).toBe(
      'pending',
    );
    expect(decideAfterFailure(MAX_EMAIL_ATTEMPTS, false, NOW)).toEqual({
      status: 'failed',
    });
  });
});
