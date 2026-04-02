ALTER POLICY "collaborator_delete" ON "scholio"."project_collaborator" TO public USING (
				"scholio"."project_collaborator"."role" != 'owner'
				AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_collaborator"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);