/** Depois disso o email vira `failed` e para de tentar (fica visível na tabela e nas métricas). */
export const MAX_EMAIL_ATTEMPTS = 6;

/** Quanto tempo uma linha reservada fica "escondida" dos outros workers enquanto é enviada. */
export const EMAIL_CLAIM_LEASE_MS = 5 * 60_000;

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 60 * 60_000;

/** Espera antes da próxima tentativa: 30s, 2min, 8min, 32min, ~2h (teto de 6h). */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(BASE_DELAY_MS * 4 ** exponent, MAX_DELAY_MS);
}

export type FailureDecision =
  { status: 'failed' } | { status: 'pending'; nextAttemptAt: Date };

/**
 * Falha permanente (endereço inválido, remetente não autorizado) não adianta repetir.
 * Falha temporária (provedor fora, limite de taxa) tenta de novo até MAX_EMAIL_ATTEMPTS.
 */
export function decideAfterFailure(
  attempts: number,
  permanent: boolean,
  now: Date,
): FailureDecision {
  if (permanent || attempts >= MAX_EMAIL_ATTEMPTS) {
    return { status: 'failed' };
  }
  return {
    status: 'pending',
    nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
  };
}
