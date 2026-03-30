ALTER TABLE "scholio"."document" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scholio"."document" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER POLICY "document_select" ON "scholio"."document" TO public USING (
				("scholio"."document"."is_private" = true AND "scholio"."document"."owner_user_id" = current_setting('app.current_user_id', true))
				OR
				("scholio"."document"."is_private" = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."document"."project_id"
					AND (
						project.owner_id = current_setting('app.current_user_id', true)
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = current_setting('app.current_user_id', true)
						)
					)
				))
			);--> statement-breakpoint
ALTER POLICY "document_insert" ON "scholio"."document" TO public WITH CHECK (
				("scholio"."document"."is_private" = true AND "scholio"."document"."owner_user_id" = current_setting('app.current_user_id', true)
					AND EXISTS (
						SELECT 1 FROM scholio.project
						WHERE project.id = "scholio"."document"."project_id"
						AND (
							project.owner_id = current_setting('app.current_user_id', true)
							OR EXISTS (
								SELECT 1 FROM scholio.project_collaborator
								WHERE project_collaborator.project_id = project.id
								AND project_collaborator.user_id = current_setting('app.current_user_id', true)
							)
						)
					)
				)
				OR
				("scholio"."document"."is_private" = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."document"."project_id"
					AND (
						project.owner_id = current_setting('app.current_user_id', true)
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = current_setting('app.current_user_id', true)
						)
					)
				))
			);--> statement-breakpoint
ALTER POLICY "document_update" ON "scholio"."document" TO public USING (
				("scholio"."document"."is_private" = true AND "scholio"."document"."owner_user_id" = current_setting('app.current_user_id', true))
				OR
				("scholio"."document"."is_private" = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."document"."project_id"
					AND (
						("scholio"."document"."writer_user_id" IS NULL AND project.owner_id = current_setting('app.current_user_id', true))
						OR "scholio"."document"."writer_user_id" = current_setting('app.current_user_id', true)
					)
				))
			);--> statement-breakpoint
ALTER POLICY "document_delete" ON "scholio"."document" TO public USING (
				("scholio"."document"."is_private" = true AND "scholio"."document"."owner_user_id" = current_setting('app.current_user_id', true))
				OR
				("scholio"."document"."is_private" = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."document"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				))
			);