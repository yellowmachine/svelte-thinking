CREATE TABLE "project_context_link" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
	"linked_document_id" text NOT NULL REFERENCES "document"("id") ON DELETE CASCADE,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "ctx_link_unique_idx" ON "project_context_link" ("project_id", "linked_document_id");
CREATE INDEX "ctx_link_project_idx" ON "project_context_link" ("project_id");

ALTER TABLE "project_context_link" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "context_link_access" ON "project_context_link"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project
      WHERE project.id = project_id
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
