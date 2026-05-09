ALTER TABLE "User" ADD COLUMN "max_chat_id" TEXT;

ALTER TABLE "Client" ADD COLUMN "max_chat_id" TEXT;

CREATE TABLE "MaxNotificationLog" (
    "id" SERIAL NOT NULL,
    "lesson_id" INTEGER NOT NULL,
    "reminder_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'MAX',
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaxNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaxNotificationLog_lesson_id_reminder_type_channel_key"
    ON "MaxNotificationLog"("lesson_id", "reminder_type", "channel");

CREATE INDEX "MaxNotificationLog_status_idx" ON "MaxNotificationLog"("status");

CREATE INDEX "MaxNotificationLog_sent_at_idx" ON "MaxNotificationLog"("sent_at");

ALTER TABLE "MaxNotificationLog"
    ADD CONSTRAINT "MaxNotificationLog_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
