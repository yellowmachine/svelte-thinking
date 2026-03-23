CREATE TYPE "scholio"."analysis_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "scholio"."analysis_type" AS ENUM('describe', 'ttest');--> statement-breakpoint
CREATE TABLE "scholio"."project_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"type" "scholio"."analysis_type" NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"status" "scholio"."analysis_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_analysis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project_template" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."project_analysis" ADD CONSTRAINT "project_analysis_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_analysis" ADD CONSTRAINT "project_analysis_dataset_id_project_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "scholio"."project_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_template" ADD CONSTRAINT "project_template_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_project_idx" ON "scholio"."project_analysis" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "analysis_dataset_idx" ON "scholio"."project_analysis" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "template_project_idx" ON "scholio"."project_template" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "template_public_idx" ON "scholio"."project_template" USING btree ("is_public");--> statement-breakpoint
CREATE POLICY "analysis_access" ON "scholio"."project_analysis" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_analysis"."project_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "template_access" ON "scholio"."project_template" AS PERMISSIVE FOR ALL TO public USING (
				"scholio"."project_template"."is_public" = true
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_template"."project_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);