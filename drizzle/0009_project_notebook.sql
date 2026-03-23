CREATE TABLE "scholio"."project_notebook" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"imported_by" text NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"source" text DEFAULT 'file' NOT NULL,
	"remote_url" text,
	"kernel_name" text,
	"language_name" text,
	"cells" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_notebook" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "scholio"."project_notebook" ADD CONSTRAINT "project_notebook_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notebook_project_idx" ON "scholio"."project_notebook" USING btree ("project_id");
--> statement-breakpoint
CREATE POLICY "notebook_access" ON "scholio"."project_notebook" AS PERMISSIVE FOR ALL TO public USING (
	EXISTS (
		SELECT 1 FROM scholio.project
		WHERE project.id = "scholio"."project_notebook"."project_id"
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
