/*
  Outbox de emails (módulo notification).

  Quem gera o fato (ex.: pagamento aprovado) insere aqui na MESMA transação; o worker envia
  depois pelo provedor (Resend em produção, Mailpit em dev), com novas tentativas.
  - dedupe_key único: um email por fato (webhook repetido não duplica); também é a
    idempotency key enviada ao provedor.
  - (status, next_attempt_at): a busca do worker por emails vencidos.
  - Fora da publication `bilheteria_search`: nada de email vai para o Elasticsearch.
*/
-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_outbox_attempts_non_negative" CHECK ("attempts" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_dedupe_key_key" ON "email_outbox"("dedupe_key");

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");
