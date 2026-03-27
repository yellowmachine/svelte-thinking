ALTER TYPE "scholio"."org_member_role" ADD VALUE 'guest';--> statement-breakpoint
CREATE TABLE "scholio"."ai_usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"task" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_eur" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."ai_usage_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."organization" ADD COLUMN "monthly_budget_eur" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "project_budget_eur" numeric(10, 2);--> statement-breakpoint
CREATE INDEX "ai_usage_log_org_idx" ON "scholio"."ai_usage_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_log_project_idx" ON "scholio"."ai_usage_log" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_log_user_idx" ON "scholio"."ai_usage_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "ai_usage_log_select" ON "scholio"."ai_usage_log" AS PERMISSIVE FOR SELECT TO public USING (
				"scholio"."ai_usage_log"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				OR (
					"scholio"."ai_usage_log"."org_id" IS NOT NULL
					AND EXISTS (
						SELECT 1 FROM scholio.organization
						WHERE organization.id = "scholio"."ai_usage_log"."org_id"
						AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
					)
				)
			);--> statement-breakpoint
CREATE POLICY "ai_usage_log_insert" ON "scholio"."ai_usage_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("scholio"."ai_usage_log"."user_id" = nullif(current_setting('app.current_user_id', true), ''));