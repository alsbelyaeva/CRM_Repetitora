-- CreateTable
CREATE TABLE "RecurringSeries" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "repeat_count" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSeries_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "recurring_series_id" INTEGER;

-- CreateIndex
CREATE INDEX "RecurringSeries_client_id_idx" ON "RecurringSeries"("client_id");
CREATE INDEX "RecurringSeries_user_id_idx" ON "RecurringSeries"("user_id");
CREATE INDEX "RecurringSeries_status_idx" ON "RecurringSeries"("status");
CREATE INDEX "Lesson_recurring_series_id_idx" ON "Lesson"("recurring_series_id");

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_recurring_series_id_fkey" FOREIGN KEY ("recurring_series_id") REFERENCES "RecurringSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
