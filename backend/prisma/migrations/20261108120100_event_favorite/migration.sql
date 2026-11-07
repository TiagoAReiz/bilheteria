-- Favoritos (wishlist): um por usuário e evento (PK composta: favoritar de novo não duplica).
--   - Apagar o usuário ou o evento apaga os favoritos (CASCADE).
--   - Índice por evento: o agendador do email de abertura das vendas busca quem favoritou cada evento.
--   - Fora da publication `bilheteria_search`: favoritos não vão para o Elasticsearch.
CREATE TABLE "event_favorite" (
    "user_id" TEXT NOT NULL,
    "event_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_favorite_pkey" PRIMARY KEY ("user_id", "event_id")
);

CREATE INDEX "event_favorite_event_id_idx" ON "event_favorite"("event_id");

ALTER TABLE "event_favorite" ADD CONSTRAINT "event_favorite_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_favorite" ADD CONSTRAINT "event_favorite_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
