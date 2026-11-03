import {
  effectiveTicketStatus,
  reservationExpiryCutoff,
} from '../../../../../src/modules/ticket/core/entities/ticket-search.entity.js';
import { RESERVATION_TTL_MINUTES } from '../../../../../src/modules/ticket/core/entities/reservation.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

describe('ticket-search.entity', () => {
  it('reservationExpiryCutoff volta o TTL da reserva', () => {
    expect(reservationExpiryCutoff(NOW).getTime()).toBe(NOW.getTime() - TTL_MS);
  });

  describe('effectiveTicketStatus', () => {
    it('reserva mais velha que o TTL vira expired', () => {
      const reservedAt = new Date(NOW.getTime() - TTL_MS - 1);
      expect(effectiveTicketStatus('reserved', reservedAt, NOW)).toBe(
        'expired',
      );
    });

    it('reserva exatamente no limite ainda vale (mesma regra do pagamento)', () => {
      const reservedAt = new Date(NOW.getTime() - TTL_MS);
      expect(effectiveTicketStatus('reserved', reservedAt, NOW)).toBe(
        'reserved',
      );
    });

    it.each(['available', 'paid'] as const)(
      '%s não muda com o tempo',
      (status) => {
        const old = new Date(NOW.getTime() - 60 * TTL_MS);
        expect(effectiveTicketStatus(status, old, NOW)).toBe(status);
      },
    );

    it('reserved sem data continua reserved', () => {
      expect(effectiveTicketStatus('reserved', null, NOW)).toBe('reserved');
    });
  });
});
