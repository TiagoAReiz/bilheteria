export const SALES_OPENING_REPOSITORY = Symbol('SALES_OPENING_REPOSITORY');

export interface SalesOpeningRepositoryPort {
  /**
   * Enfileira na outbox o aviso para cada favorito de evento não cancelado cujas vendas abrem
   * entre agora e `noticeMs` (relógio do Postgres). Idempotente. Retorna quantos entraram.
   */
  enqueueDue(noticeMs: number): Promise<number>;
}
