-- migrate datasets from S3 to Postgres: drop key/url, add content column
ALTER TABLE "scholio"."project_dataset" DROP COLUMN IF EXISTS "key";--> statement-breakpoint
ALTER TABLE "scholio"."project_dataset" DROP COLUMN IF EXISTS "url";--> statement-breakpoint
ALTER TABLE "scholio"."project_dataset" ADD COLUMN IF NOT EXISTS "content" text NOT NULL DEFAULT '';
