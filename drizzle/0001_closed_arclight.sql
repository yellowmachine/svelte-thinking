ALTER TABLE "scholio"."project_dataset" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" ADD COLUMN "pdf_key" text;--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" ADD COLUMN "pdf_url" text;--> statement-breakpoint
ALTER TABLE "scholio"."project_dataset" DROP COLUMN "key";--> statement-breakpoint
ALTER TABLE "scholio"."project_dataset" DROP COLUMN "url";