import { ImageKind, UploadRejection } from '../../../../core/entities/image.js';

export const STORAGE_METRICS = Symbol('STORAGE_METRICS');

// Métricas de negócio das imagens em termos do domínio (ver TicketMetricsPort). Nunca recebem ids.
export interface StorageMetricsPort {
  uploadUrlIssued(kind: ImageKind): void;
  /** Objeto conferido no bucket e válido (antes de quem chamou gravar a referência). */
  uploadConfirmed(kind: ImageKind): void;
  uploadRejected(kind: ImageKind, reason: UploadRejection): void;
  /** Objeto substituído/removido que não conseguimos apagar do bucket (fica órfão). */
  objectDeleteFailed(kind: ImageKind): void;
}
