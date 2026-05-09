-- Add user_id to Client table
ALTER TABLE "Client" ADD COLUMN "user_id" TEXT;

-- Set a default user_id for existing clients (admin user or null - adjust as needed)
-- If you have an admin user, replace the uuid below with the actual admin user ID
-- For now, we'll leave it as is and manually set it later
UPDATE "Client" SET "user_id" = 'default-user-id' WHERE "user_id" IS NULL;

-- Make user_id required
ALTER TABLE "Client" ALTER COLUMN "user_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "Client" ADD CONSTRAINT "Client_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;

-- Add index on user_id for better query performance
CREATE INDEX "Client_user_id_idx" ON "Client"("user_id");
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