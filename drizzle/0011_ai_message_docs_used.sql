ALTER TABLE "scholio"."ai_message" ADD COLUMN "docs_used" jsonb NOT NULL DEFAULT '[]'::jsonb;
