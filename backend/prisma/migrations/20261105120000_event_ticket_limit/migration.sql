-- Limite de ingressos por CPF definido pelo organizador (antes era fixo em 2 no código).
-- O default 2 preserva o comportamento dos eventos já criados.
ALTER TABLE "event" ADD COLUMN "max_tickets_per_cpf" INTEGER NOT NULL DEFAULT 2;

-- mesmos limites do CreateEventDto (MIN/MAX_TICKETS_PER_CPF)
ALTER TABLE "event" ADD CONSTRAINT "event_max_tickets_per_cpf_range"
    CHECK ("max_tickets_per_cpf" BETWEEN 1 AND 10);
