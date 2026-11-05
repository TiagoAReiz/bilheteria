export const EMAIL_DISPATCH_SERVICE = Symbol('EMAIL_DISPATCH_SERVICE');

export interface DispatchSummary {
  sent: number;
  retried: number;
  failed: number;
}

export interface EmailDispatchServicePort {
  /** Envia um lote de emails vencidos da outbox. */
  dispatchDue(): Promise<DispatchSummary>;
}
