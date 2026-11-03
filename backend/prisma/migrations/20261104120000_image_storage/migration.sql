/*
  Imagens (S3): capa e galeria do evento e avatar do usuário.

  SQL gerado offline com `prisma migrate diff --from-schema <schema anterior> --to-schema
  <schema.prisma> --script`; os comentários foram acrescentados à mão.

  O banco guarda só a CHAVE do objeto no bucket, nunca a URL: a URL pública é montada pela API
  com STORAGE_PUBLIC_URL, então trocar LocalStack por S3/CloudFront/R2 é só mudar o .env.

  event.cover_key
  - Entra no documento do índice `events` (transform do Sequin): os cards da busca mostram a capa.
    O mapping ganha o campo `cover_key` (infra/search/elasticsearch); em índice já existente o
    campo é ADICIONADO pelo search-init (PUT _mapping, sem reindexar). Ordem ao atualizar um
    ambiente: `docker compose run --rm search-init`, esta migration e reiniciar o Sequin
    (recarrega a transform). Ver README da raiz.

  event_photo (galeria)
  - Até 10 por evento: o limite é checado com a linha do evento travada (SELECT ... FOR UPDATE),
    então confirmações simultâneas não passam de 10.
  - (event_id, position) único; a reordenação passa por posições negativas na mesma transação.
  - ON DELETE CASCADE: hoje evento só é excluído logicamente (deleted_at), mas uma exclusão física
    não deixa fotos órfãs no banco (os objetos no bucket continuariam lá).
  - Fica FORA da publication `bilheteria_search`.

  users.avatar_key
  - `image` continua sendo a foto do Google/Facebook (Better Auth); o avatar servido é
    avatar_key ?? image. Campo do Better Auth com `input: false`: o cliente não escreve direto.
*/
-- AlterTable
ALTER TABLE "event" ADD COLUMN     "cover_key" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_key" TEXT;

-- CreateTable
CREATE TABLE "event_photo" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_photo_key_key" ON "event_photo"("key");

-- CreateIndex
CREATE UNIQUE INDEX "event_photo_event_id_position_key" ON "event_photo"("event_id", "position");

-- AddForeignKey
ALTER TABLE "event_photo" ADD CONSTRAINT "event_photo_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
