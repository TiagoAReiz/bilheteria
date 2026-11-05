import { EmailKind } from '../../../../core/entities/email.js';

export const EMAIL_METRICS = Symbol('EMAIL_METRICS');

export type EmailOutcome = 'sent' | 'retry' | 'failed';

export interface EmailMetricsPort {
  emailProcessed(kind: EmailKind, outcome: EmailOutcome): void;
}
