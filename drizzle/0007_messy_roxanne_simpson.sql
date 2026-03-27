ALTER TABLE "scholio"."user_ai_config" RENAME TO "user_api_key";--> statement-breakpoint
ALTER TABLE "scholio"."user_api_key" RENAME COLUMN "provider" TO "name";--> statement-breakpoint
DROP INDEX "scholio"."user_ai_config_user_provider_idx";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" ADD COLUMN "ai_task_config" text;--> statement-breakpoint
ALTER TABLE "scholio"."user_api_key" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "default_ai_provider";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "default_ai_model";--> statement-breakpoint
ALTER POLICY "user_ai_config_access" ON "scholio"."user_api_key" RENAME TO "user_api_key_access";