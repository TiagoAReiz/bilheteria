import { RESERVATION_TTL_MINUTES } from './reservation.entity.js';

export const TICKET_SEARCH_STATUSES = [
  'available',
  'reserved',
  'paid',
  'expired',
] as const;
export type TicketSearchStatus = (typeof TICKET_SEARCH_STATUSES)[number];

/**
 * Status gravado no indice no momento da ultima mudanca da linha (transform do Sequin).
 * "expired" nao existe aqui: uma reserva expira com o passar do tempo, sem nenhuma escrita
 * no Postgres, entao nao gera evento de CDC. Ele e derivado na leitura (ver effectiveTicketStatus).
 */
export type StoredTicketStatus = Exclude<TicketSearchStatus, 'expired'>;

export const TICKET_SEARCH_LIMITS = {
  defaultPageSize: 20,
  maxPageSize: 100,
  maxPage: 100,
} as const;

export interface TicketSearchCriteria {
  /** Restringe aos eventos informados; `undefined` = todos (ADMIN). */
  eventIds?: number[];
  status?: TicketSearchStatus;
  page: number;
  size: number;
}

export interface TicketSearchItem {
  id: number;
  event_id: number;
  user_id: string | null;
  status: TicketSearchStatus;
  reserved_at: Date | null;
  is_paid: boolean;
}

export interface TicketSearchResult {
  items: TicketSearchItem[];
  total: number;
  page: number;
  size: number;
}

/** Instante antes do qual uma reserva nao paga ja expirou (mesma regra da reserva e do /status/:id). */
export function reservationExpiryCutoff(now: Date): Date {
  return new Date(now.getTime() - RESERVATION_TTL_MINUTES * 60 * 1000);
}

export function effectiveTicketStatus(
  stored: StoredTicketStatus,
  reservedAt: Date | null,
  now: Date,
): TicketSearchStatus {
  if (
    stored === 'reserved' &&
    reservedAt !== null &&
    reservedAt < reservationExpiryCutoff(now)
  ) {
    return 'expired';
  }
  return stored;
}
