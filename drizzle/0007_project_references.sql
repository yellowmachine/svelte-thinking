CREATE TYPE "reference_type" AS ENUM ('article', 'book', 'inproceedings', 'incollection', 'phdthesis', 'mastersthesis', 'techreport', 'misc');--> statement-breakpoint
CREATE TABLE "project_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"cite_key" text NOT NULL,
	"type" "reference_type" NOT NULL DEFAULT 'article',
	"title" text NOT NULL,
	"authors" jsonb NOT NULL DEFAULT '[]',
	"year" text,
	"abstract" text,
	"doi" text,
	"url" text,
	"note" text,
	"journal" text,
	"volume" text,
	"issue" text,
	"pages" text,
	"publisher" text,
	"edition" text,
	"address" text,
	"isbn" text,
	"editors" jsonb DEFAULT '[]',
	"booktitle" text,
	"organization" text,
	"series" text,
	"school" text,
	"institution" text,
	"report_number" text,
	"extra" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_reference_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX "ref_project_key_idx" ON "project_reference" ("project_id", "cite_key");--> statement-breakpoint
CREATE INDEX "ref_project_idx" ON "project_reference" ("project_id");--> statement-breakpoint
ALTER TABLE "project_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_access" ON "project_reference" AS PERMISSIVE FOR ALL TO public USING (
	EXISTS (
		SELECT 1 FROM project
		WHERE project.id = project_reference.project_id
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
