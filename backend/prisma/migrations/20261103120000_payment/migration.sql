/*
  Pagamento com Mercado Pago (Checkout Pro via API de Orders).

  SQL gerado offline com `prisma migrate diff --from-schema <schema anterior> --to-schema
  <schema.prisma> --script` (os índices parciais vêm do preview feature `partialIndexes`);
  os CHECKs e os comentários foram acrescentados à mão (o Prisma não modela CHECK, mas também
  não os remove em migrations futuras).

  event.price_cents (preço único do ingresso, em centavos de BRL)
  - Eventos que já existem ficam com NULL: não há preço "certo" para inventar, e um valor
    padrão (R$ 0,01, R$ 1,00...) venderia ingressos por um preço que o organizador nunca
    definiu. NULL = "sem venda": o POST /payments/checkout recusa com 409 até o evento ganhar
    preço (hoje só direto no banco). Todo evento novo nasce com preço, porque o POST /events
    passou a exigir `price_cents`.
  - A coluna fica fora do índice de busca: a transform do Sequin escolhe os campos um a um.

  payment
  - `payment_one_approved_per_ticket`: índice único parcial, no máximo UM pagamento aprovado
    por ticket. É a última barreira contra vender o mesmo ingresso duas vezes (a primeira é o
    `SELECT ... FOR UPDATE` no ticket durante a confirmação).
  - `payment_one_pending_per_ticket`: no máximo um checkout pendente por ticket; um checkout
    novo expira os pendentes antigos na mesma transação.
  - `(provider, provider_order_id)` e `(provider, provider_payment_id)` únicos: idempotência
    pelos ids do provedor (NULLs não colidem no Postgres).
  - "payment" NÃO entra na publication `bilheteria_search`: nada de pagamento vai para o
    Elasticsearch.
*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded');

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "price_cents" INTEGER;
ALTER TABLE "event" ADD CONSTRAINT "event_price_cents_positive" CHECK ("price_cents" IS NULL OR "price_cents" > 0);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "checkout_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_amount_cents_positive" CHECK ("amount_cents" > 0),
    CONSTRAINT "payment_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$')
);

-- CreateIndex
CREATE INDEX "payment_ticket_id_status_idx" ON "payment"("ticket_id", "status");

-- CreateIndex
CREATE INDEX "payment_user_id_idx" ON "payment"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_provider_order_id_key" ON "payment"("provider", "provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_provider_payment_id_key" ON "payment"("provider", "provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_one_approved_per_ticket" ON "payment"("ticket_id") WHERE ("status" = 'approved');

-- CreateIndex
CREATE UNIQUE INDEX "payment_one_pending_per_ticket" ON "payment"("ticket_id") WHERE ("status" = 'pending');

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
