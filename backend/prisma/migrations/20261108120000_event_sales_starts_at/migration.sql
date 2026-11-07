-- Início das vendas programado ("Em breve").
--   - NULL = vendendo desde a criação (todos os eventos que já existiam ficam assim).
--   - Em breve enquanto sales_starts_at > now(); a reserva e o checkout recusam até lá.
--   - A abertura é sempre antes do início do evento.
ALTER TABLE "event" ADD COLUMN "sales_starts_at" TIMESTAMP(3);

ALTER TABLE "event" ADD CONSTRAINT "event_sales_before_start_check"
  CHECK ("sales_starts_at" IS NULL OR "sales_starts_at" < "starts_at");

-- o agendador do aviso por email filtra por aqui
CREATE INDEX "event_sales_starts_at_idx" ON "event" ("sales_starts_at")
  WHERE "sales_starts_at" IS NOT NULL AND "deleted_at" IS NULL;
