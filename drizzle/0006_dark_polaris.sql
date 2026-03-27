ALTER TABLE "scholio"."document" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "scholio"."document" ALTER COLUMN "type" SET DEFAULT 'paper'::text;--> statement-breakpoint
DROP TYPE "scholio"."document_type";--> statement-breakpoint
CREATE TYPE "scholio"."document_type" AS ENUM('paper', 'notes', 'outline', 'bibliography', 'supplementary', 'book', 'chapter');--> statement-breakpoint
ALTER TABLE "scholio"."document" ALTER COLUMN "type" SET DEFAULT 'paper'::"scholio"."document_type";--> statement-breakpoint
ALTER TABLE "scholio"."document" ALTER COLUMN "type" SET DATA TYPE "scholio"."document_type" USING "type"::"scholio"."document_type";--> statement-breakpoint
ALTER TABLE "scholio"."document" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;