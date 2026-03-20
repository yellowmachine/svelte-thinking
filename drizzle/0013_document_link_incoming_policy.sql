CREATE POLICY "document_link_incoming_public" ON "document_link"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document source_doc
      WHERE source_doc.id = source_document_id
      AND source_doc.is_public = true
    )
    AND EXISTS (
      SELECT 1 FROM document target_doc
      JOIN project ON project.id = target_doc.project_id
      WHERE target_doc.id = target_document_id
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
