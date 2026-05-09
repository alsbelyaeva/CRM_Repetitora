/*
  Warnings:

  - Made the column `working_days` on table `SlotWeight` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_user_id_fkey";

-- AlterTable
ALTER TABLE "SlotWeight" ALTER COLUMN "working_days" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
