CREATE TABLE "scholio"."issue_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."issue_comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."issue_comment" ADD CONSTRAINT "issue_comment_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "scholio"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_comment_issue_idx" ON "scholio"."issue_comment" USING btree ("issue_id");--> statement-breakpoint
CREATE POLICY "issue_comment_select" ON "scholio"."issue_comment" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."issue_comment"."project_id"
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
CREATE POLICY "issue_comment_insert" ON "scholio"."issue_comment" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				"scholio"."issue_comment"."author_id" = nullif(current_setting('app.current_user_id', true), '')
				AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."issue_comment"."project_id"
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
CREATE POLICY "issue_comment_update" ON "scholio"."issue_comment" AS PERMISSIVE FOR UPDATE TO public USING ("scholio"."issue_comment"."author_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "issue_comment_delete" ON "scholio"."issue_comment" AS PERMISSIVE FOR DELETE TO public USING ("scholio"."issue_comment"."author_id" = nullif(current_setting('app.current_user_id', true), ''));