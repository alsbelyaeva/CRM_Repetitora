-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEACHER');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "full_name" TEXT NOT NULL,
    "tags" JSONB,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "client_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_min" INTEGER NOT NULL,
    "notes" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,
    "status" "LessonStatus" NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "client_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_time" TIMESTAMP(3) NOT NULL,
    "lesson_id" INTEGER,
    "note" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotRequest" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "proposed_slots" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotWeight" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "wTime" DOUBLE PRECISION NOT NULL,
    "wCompact" DOUBLE PRECISION NOT NULL,
    "wWeekday" DOUBLE PRECISION NOT NULL,
    "wPriority" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- CreateIndex
CREATE INDEX "Lesson_start_time_idx" ON "Lesson"("start_time");

-- CreateIndex
CREATE INDEX "Lesson_user_id_start_time_idx" ON "Lesson"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "Payment_client_id_idx" ON "Payment"("client_id");

-- CreateIndex
CREATE INDEX "Payment_date_time_idx" ON "Payment"("date_time");

-- CreateIndex
CREATE INDEX "SlotRequest_client_id_idx" ON "SlotRequest"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "SlotWeight_userId_key" ON "SlotWeight"("userId");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotRequest" ADD CONSTRAINT "SlotRequest_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotWeight" ADD CONSTRAINT "SlotWeight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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