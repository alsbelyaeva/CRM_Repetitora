CREATE TABLE "lesson_participants" (
    "id" SERIAL NOT NULL,
    "lesson_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_participants_pkey" PRIMARY KEY ("id")
);

INSERT INTO "lesson_participants" ("lesson_id", "client_id")
SELECT "id", "client_id"
FROM "Lesson"
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "lesson_participants_lesson_id_client_id_key" ON "lesson_participants"("lesson_id", "client_id");
CREATE INDEX "lesson_participants_client_id_idx" ON "lesson_participants"("client_id");

ALTER TABLE "lesson_participants" ADD CONSTRAINT "lesson_participants_lesson_id_fkey"
FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_participants" ADD CONSTRAINT "lesson_participants_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
