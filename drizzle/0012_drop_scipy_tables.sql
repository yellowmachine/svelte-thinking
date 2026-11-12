DROP POLICY "analysis_access" ON "scholio"."project_analysis" CASCADE;--> statement-breakpoint
DROP TABLE "scholio"."project_analysis" CASCADE;--> statement-breakpoint
DROP POLICY "template_access" ON "scholio"."project_template" CASCADE;--> statement-breakpoint
DROP TABLE "scholio"."project_template" CASCADE;--> statement-breakpoint
DROP TYPE "scholio"."analysis_status";--> statement-breakpoint
DROP TYPE "scholio"."analysis_type";