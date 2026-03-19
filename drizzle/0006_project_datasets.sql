CREATE TABLE "project_dataset" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_dataset_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX "dataset_project_idx" ON "project_dataset" ("project_id");--> statement-breakpoint
ALTER TABLE "project_dataset" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dataset_access" ON "project_dataset" AS PERMISSIVE FOR ALL TO public USING (
	EXISTS (
		SELECT 1 FROM project
		WHERE project.id = project_dataset.project_id
		AND (
			project.owner_id = nullif(current_setting('app.current_user_id', true), '')
			OR EXISTS (
				SELECT 1 FROM project_collaborator
				WHERE project_collaborator.project_id = project.id
				AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
			)
		)
	)
);
