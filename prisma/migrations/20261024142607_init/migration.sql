/*
  Warnings:

  - The `reserved_at` column on the `ticket` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ticket" DROP COLUMN "reserved_at",
ADD COLUMN     "reserved_at" TIMESTAMP(3);
