/*
  Warnings:

  - Added the required column `updatedAt` to the `SlotWeight` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Lesson" DROP CONSTRAINT "Lesson_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lesson" DROP CONSTRAINT "Lesson_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SlotWeight" DROP CONSTRAINT "SlotWeight_userId_fkey";

-- AlterTable
ALTER TABLE "SlotWeight" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotWeight" ADD CONSTRAINT "SlotWeight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Добавляем поле workingDays в таблицу SlotWeight
-- Удаляем старое поле wWeekday, если оно существует

-- Шаг 1: Добавляем новое поле workingDays
ALTER TABLE "SlotWeight" 
ADD COLUMN IF NOT EXISTS "working_days" JSONB DEFAULT '[1,2,3,4,5]';

-- Шаг 2: Удаляем старое поле wWeekday (если существует)
ALTER TABLE "SlotWeight" 
DROP COLUMN IF EXISTS "wWeekday";

-- Шаг 3: Обновляем существующие записи, добавляя рабочие дни по умолчанию
UPDATE "SlotWeight" 
SET "working_days" = '[1,2,3,4,5]'::jsonb
WHERE "working_days" IS NULL;

-- Комментарий для понимания структуры
COMMENT ON COLUMN "SlotWeight"."working_days" IS 
'Массив дней недели, когда пользователь принимает клиентов (0=воскресенье, 1=понедельник, ..., 6=суббота)';