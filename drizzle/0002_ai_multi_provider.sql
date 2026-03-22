-- Multi-provider AI support:
-- 1. user_ai_config: drop unique on user_id, add composite unique (user_id, provider)
-- 2. user_profile: add default_ai_provider and default_ai_model columns

ALTER TABLE "scholio"."user_ai_config" DROP CONSTRAINT IF EXISTS "user_ai_config_user_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_config_user_provider_idx" ON "scholio"."user_ai_config" USING btree ("user_id", "provider");--> statement-breakpoint
ALTER TABLE "scholio"."user_ai_config" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" ADD COLUMN "default_ai_provider" text DEFAULT 'openrouter';--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" ADD COLUMN "default_ai_model" text;
