/*
  CDC para a busca (Sequin -> Elasticsearch).

  A publication fica aqui, e não no Sequin nem num init script do Postgres, porque:
  - ela só pode ser criada depois que "event" e "ticket" existem, e quem cria as tabelas são
    as migrations (um init script roda antes delas, num banco vazio);
  - é barata: publication não retém WAL; quem retém é o replication slot. Por isso o slot NÃO
    é criado aqui: ele pertence ao consumidor (o Sequin cria com `create_if_not_exists`).
    Criar slot numa migration seria perigoso: o `prisma migrate dev` aplica as migrations num
    shadow database descartável, e um slot lá dentro reteria WAL e impediria o DROP DATABASE.
  - no shadow database a publication some junto com o banco, sem efeito colateral.

  Só "event" e "ticket" são publicadas: users/sessions/accounts (CPF, tokens) nem chegam a ser
  decodificadas para o Sequin.

  Idempotente: `prisma migrate reset` apaga as tabelas mas não a publication (objeto do banco),
  então a reaplicação ajusta a lista de tabelas em vez de falhar com "already exists".
*/
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'bilheteria_search') THEN
        ALTER PUBLICATION bilheteria_search SET TABLE "event", "ticket";
    ELSE
        CREATE PUBLICATION bilheteria_search FOR TABLE "event", "ticket";
    END IF;
END
$$;

-- "event" tem "description" (TEXT), que pode ir para TOAST. Com a replica identity padrão, um
-- UPDATE que não mexe na coluna chega ao Sequin como "unchanged_toast", e o sink do
-- Elasticsearch sempre reescreve o documento inteiro (bulk `index`). FULL manda a linha toda.
-- "ticket" não tem colunas grandes: a identidade padrão (chave primária) basta.
ALTER TABLE "event" REPLICA IDENTITY FULL;
