/*
  Warnings:

  - You are about to alter the column `reserved_at` on the `ticket` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "ticket" ALTER COLUMN "reserved_at" DROP NOT NULL,
ALTER COLUMN "reserved_at" SET DATA TYPE INTEGER;
