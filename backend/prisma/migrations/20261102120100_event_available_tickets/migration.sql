-- AlterTable
ALTER TABLE "event" ADD COLUMN     "available_tickets" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ticket_event_id_idx" ON "ticket"("event_id");

-- Preenche o contador dos eventos existentes com o mesmo critério do job de disponibilidade
-- e do GET /status/:id: não pago e (nunca reservado ou reserva expirada, TTL de 5 minutos).
UPDATE "event" AS e
SET "available_tickets" = c.available
FROM (
    SELECT t."event_id", COUNT(*)::int AS available
    FROM "ticket" AS t
    WHERE t."is_paid" = false
      AND (t."reserved_at" IS NULL OR t."reserved_at" < NOW() - make_interval(mins => 5))
    GROUP BY t."event_id"
) AS c
WHERE e."id" = c."event_id";
