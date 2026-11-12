DROP POLICY "ai_suggestion_access" ON "scholio"."ai_suggestion" CASCADE;--> statement-breakpoint
DROP TABLE "scholio"."ai_suggestion" CASCADE;--> statement-breakpoint
DROP POLICY "user_ai_usage_access" ON "scholio"."user_ai_usage" CASCADE;--> statement-breakpoint
DROP TABLE "scholio"."user_ai_usage" CASCADE;--> statement-breakpoint
DROP TYPE "scholio"."ai_suggestion_status";--> statement-breakpoint
DROP TYPE "scholio"."ai_suggestion_type";