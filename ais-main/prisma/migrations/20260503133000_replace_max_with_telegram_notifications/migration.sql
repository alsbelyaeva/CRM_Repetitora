ALTER TABLE "User" RENAME COLUMN "max_chat_id" TO "telegram_chat_id";

ALTER TABLE "Client" RENAME COLUMN "max_chat_id" TO "telegram_chat_id";

ALTER TABLE "MaxNotificationLog" RENAME TO "TelegramNotificationLog";

ALTER TABLE "TelegramNotificationLog" RENAME CONSTRAINT "MaxNotificationLog_pkey" TO "TelegramNotificationLog_pkey";

ALTER INDEX "MaxNotificationLog_lesson_id_reminder_type_channel_key"
    RENAME TO "TelegramNotificationLog_lesson_id_reminder_type_channel_recipient_type_recipient_id_key";

ALTER INDEX "MaxNotificationLog_status_idx" RENAME TO "TelegramNotificationLog_status_idx";

ALTER INDEX "MaxNotificationLog_sent_at_idx" RENAME TO "TelegramNotificationLog_sent_at_idx";

ALTER TABLE "TelegramNotificationLog"
    RENAME CONSTRAINT "MaxNotificationLog_lesson_id_fkey" TO "TelegramNotificationLog_lesson_id_fkey";

ALTER TABLE "TelegramNotificationLog"
    ADD COLUMN "recipient_type" TEXT NOT NULL DEFAULT 'TEACHER',
    ADD COLUMN "recipient_id" TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN "chat_id" TEXT;

UPDATE "TelegramNotificationLog"
SET "channel" = 'TELEGRAM'
WHERE "channel" = 'MAX';

DROP INDEX "TelegramNotificationLog_lesson_id_reminder_type_channel_recipient_type_recipient_id_key";

CREATE UNIQUE INDEX "TelegramNotificationLog_lesson_id_reminder_type_channel_recipient_type_recipient_id_key"
    ON "TelegramNotificationLog"("lesson_id", "reminder_type", "channel", "recipient_type", "recipient_id");

ALTER TABLE "TelegramNotificationLog"
    ALTER COLUMN "recipient_type" DROP DEFAULT,
    ALTER COLUMN "recipient_id" DROP DEFAULT;
