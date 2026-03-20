CREATE TABLE "document_link" (
	"id" text PRIMARY KEY NOT NULL,
	"source_document_id" text NOT NULL REFERENCES "document"("id") ON DELETE CASCADE,
	"target_document_id" text NOT NULL REFERENCES "document"("id") ON DELETE CASCADE,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "doc_link_unique_idx" ON "document_link" ("source_document_id", "target_document_id");
CREATE INDEX "doc_link_source_idx" ON "document_link" ("source_document_id");
CREATE INDEX "doc_link_target_idx" ON "document_link" ("target_document_id");

ALTER TABLE "document_link" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_link_access" ON "document_link"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM document
      JOIN project ON project.id = document.project_id
      WHERE document.id = source_document_id
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
