-- CreateTable
CREATE TABLE "ticket" (
    "id" SERIAL NOT NULL,
    "cpf" TEXT,
    "reserved_at" BIGINT NOT NULL,
    "is_paid" BOOLEAN NOT NULL,
    "event_id" INTEGER NOT NULL,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);
