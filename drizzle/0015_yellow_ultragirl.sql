ALTER TABLE "scholio"."document" ADD COLUMN "writer_user_id" text;--> statement-breakpoint
DROP POLICY "document_access" ON "scholio"."document" CASCADE;--> statement-breakpoint
CREATE POLICY "document_select" ON "scholio"."document" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (
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
			);--> statement-breakpoint
CREATE POLICY "document_insert" ON "scholio"."document" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				EXISTS (
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
			);--> statement-breakpoint
CREATE POLICY "document_update" ON "scholio"."document" AS PERMISSIVE FOR UPDATE TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."document"."project_id"
					AND (
						("scholio"."document"."writer_user_id" IS NULL AND project.owner_id = current_setting('app.current_user_id', true))
						OR "scholio"."document"."writer_user_id" = current_setting('app.current_user_id', true)
					)
				)
			);