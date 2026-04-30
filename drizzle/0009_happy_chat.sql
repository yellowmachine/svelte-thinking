ALTER TABLE "scholio"."user_profile" ALTER COLUMN "profile_embedding" SET DATA TYPE vector(1536);--> statement-breakpoint
ALTER TABLE "scholio"."document_chunk" ALTER COLUMN "embedding" SET DATA TYPE vector(1536);--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "use_internal_storage";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "internal_storage_used_bytes";