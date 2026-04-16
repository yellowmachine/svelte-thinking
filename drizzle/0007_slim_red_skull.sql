ALTER POLICY "issue_select" ON "scholio"."issue" TO public USING (
				("scholio"."issue"."is_private" = true AND "scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))
				OR
				("scholio"."issue"."is_private" = false AND EXISTS (
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
				))
			);--> statement-breakpoint
ALTER POLICY "issue_insert" ON "scholio"."issue" TO public WITH CHECK (
				"scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND EXISTS (
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
			);--> statement-breakpoint
ALTER POLICY "issue_update" ON "scholio"."issue" TO public USING (
				("scholio"."issue"."is_private" = true AND "scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))
				OR
				("scholio"."issue"."is_private" = false AND EXISTS (
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
				))
			);--> statement-breakpoint
ALTER POLICY "issue_delete" ON "scholio"."issue" TO public USING (
				("scholio"."issue"."is_private" = true AND "scholio"."issue"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))
				OR
				("scholio"."issue"."is_private" = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."issue"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				))
			);