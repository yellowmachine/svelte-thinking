-- Restrict document DELETE to project owner only (was: owner or collaborator)
CREATE POLICY "document_delete" ON "scholio"."document" AS PERMISSIVE FOR DELETE TO public USING (
	EXISTS (
		SELECT 1 FROM scholio.project
		WHERE project.id = "scholio"."document"."project_id"
		AND project.owner_id = current_setting('app.current_user_id', true)
	)
);
