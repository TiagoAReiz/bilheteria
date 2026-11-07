export const SALES_OPENING_SERVICE = Symbol('SALES_OPENING_SERVICE');

export interface SalesOpeningServicePort {
  /** Enfileira os avisos de abertura das vendas que venceram; retorna quantos entraram. */
  enqueueDue(): Promise<number>;
}
