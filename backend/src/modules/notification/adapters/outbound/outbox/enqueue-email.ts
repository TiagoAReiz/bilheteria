import { Prisma } from '../../../../../generated/prisma/client.js';
import { EmailRequest } from '../../../core/entities/email.js';

/**
 * Grava o pedido de email na outbox usando a transação de quem gerou o fato: se a transação
 * desfizer, o email some junto. É a única porta de entrada dos outros módulos para a outbox.
 * Um fato repetido (mesma dedupe_key) é ignorado em silêncio.
 */
export async function enqueueEmail(
  tx: Prisma.TransactionClient,
  request: EmailRequest,
): Promise<void> {
  await tx.email_outbox.createMany({
    data: [
      {
        kind: request.kind,
        dedupe_key: request.dedupeKey,
        to_email: request.to,
        payload: request.data as unknown as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });
}
