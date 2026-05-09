/*
  Warnings:

  - You are about to drop the column `createdAt` on the `SlotWeight` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `SlotWeight` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `SlotWeight` table. All the data in the column will be lost.
  - You are about to drop the column `wCompact` on the `SlotWeight` table. All the data in the column will be lost.
  - You are about to drop the column `wPriority` on the `SlotWeight` table. All the data in the column will be lost.
  - You are about to drop the column `wTime` on the `SlotWeight` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id]` on the table `SlotWeight` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updated_at` to the `SlotWeight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `SlotWeight` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "SlotWeight" DROP CONSTRAINT "SlotWeight_userId_fkey";

-- DropIndex
DROP INDEX "SlotWeight_userId_key";

-- AlterTable
ALTER TABLE "SlotRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "SlotWeight" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
DROP COLUMN "wCompact",
DROP COLUMN "wPriority",
DROP COLUMN "wTime",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gap_importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "max_gap_minutes" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "min_gap_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "preferred_times" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD COLUMN     "w_compact" DOUBLE PRECISION NOT NULL DEFAULT 0.33,
ADD COLUMN     "w_priority" DOUBLE PRECISION NOT NULL DEFAULT 0.34,
ADD COLUMN     "w_time" DOUBLE PRECISION NOT NULL DEFAULT 0.33;

-- CreateIndex
CREATE INDEX "SlotRequest_status_idx" ON "SlotRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SlotWeight_user_id_key" ON "SlotWeight"("user_id");

-- AddForeignKey
ALTER TABLE "SlotWeight" ADD CONSTRAINT "SlotWeight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
