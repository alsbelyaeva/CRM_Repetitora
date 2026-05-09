-- CreateEnum
CREATE TYPE "ScheduleEventType" AS ENUM ('PERSONAL', 'TRAVEL', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleEventStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "ScheduleEvent" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "type" "ScheduleEventType" NOT NULL DEFAULT 'PERSONAL',
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "ScheduleEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleEvent_user_id_start_time_idx" ON "ScheduleEvent"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "ScheduleEvent_status_idx" ON "ScheduleEvent"("status");

-- CreateIndex
CREATE INDEX "ScheduleEvent_type_idx" ON "ScheduleEvent"("type");

-- AddForeignKey
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
