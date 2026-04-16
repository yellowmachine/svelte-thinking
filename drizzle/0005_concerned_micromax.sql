CREATE TYPE "scholio"."issue_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "scholio"."issue_status" AS ENUM('open', 'in_progress', 'closed');--> statement-breakpoint
CREATE TABLE "scholio"."issue" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"status" "scholio"."issue_status" DEFAULT 'open' NOT NULL,
	"priority" "scholio"."issue_priority" DEFAULT 'medium' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."issue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."issue" ADD CONSTRAINT "issue_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_project_idx" ON "scholio"."issue" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "issue_status_idx" ON "scholio"."issue" USING btree ("project_id","status");--> statement-breakpoint
CREATE POLICY "issue_select" ON "scholio"."issue" AS PERMISSIVE FOR SELECT TO public USING (
				("scholio"."issue"."is_private" = true AND "scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))
				OR
				("scholio"."issue"."is_private" = false AND 
	EXISTS (
		SELECT 1 FROM scholio.project
		WHERE project.id = "scholio"."issue"."project_id"
		AND (
			project.owner_id = nullif(current_setting('app.current_user_id', true), '')
			OR EXISTS (
				SELECT 1 FROM scholio.project_collaborator
				WHERE project_collaborator.project_id = project.id
				AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
			)
		)
	)
)
			);--> statement-breakpoint
CREATE POLICY "issue_insert" ON "scholio"."issue" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				"scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND (
					("scholio"."issue"."is_private" = true AND 
	EXISTS (
		SELECT 1 FROM scholio.project
		WHERE project.id = "scholio"."issue"."project_id"
		AND (
			project.owner_id = nullif(current_setting('app.current_user_id', true), '')
			OR EXISTS (
				SELECT 1 FROM scholio.project_collaborator
				WHERE project_collaborator.project_id = project.id
				AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
			)
		)
	)
)
					OR
					("scholio"."issue"."is_private" = false AND 
	EXISTS (
		SELECT 1 FROM scholio.project
		WHERE project.id = "scholio"."issue"."project_id"
		AND (
			project.owner_id = nullif(current_setting('app.current_user_id', true), '')
			OR EXISTS (
				SELECT 1 FROM scholio.project_collaborator
				WHERE project_collaborator.project_id = project.id
				AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
			)
		)
	)
)
				)
			);--> statement-breakpoint
CREATE POLICY "issue_update" ON "scholio"."issue" AS PERMISSIVE FOR UPDATE TO public USING (
				("scholio"."issue"."is_private" = true AND "scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))
				OR
				("scholio"."issue"."is_private" = false AND 
	EXISTS (
		SELECT 1 FROM scholio.project
		WHERE project.id = "scholio"."issue"."project_id"
		AND (
			project.owner_id = nullif(current_setting('app.current_user_id', true), '')
			OR EXISTS (
				SELECT 1 FROM scholio.project_collaborator
				WHERE project_collaborator.project_id = project.id
				AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
			)
		)
	)
)
			);--> statement-breakpoint
CREATE POLICY "issue_delete" ON "scholio"."issue" AS PERMISSIVE FOR DELETE TO public USING (
				("scholio"."issue"."is_private" = true AND "scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))
				OR
				("scholio"."issue"."is_private" = false AND 
	EXISTS (
		SELECT 1 FROM scholio.project
		WHERE project.id = "scholio"."issue"."project_id"
		AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
	)
)
			);