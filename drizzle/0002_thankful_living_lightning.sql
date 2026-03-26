ALTER TABLE "scholio"."project_collaborator" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
CREATE POLICY "collaborator_select_owner" ON "scholio"."project_collaborator" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."project_collaborator"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''));
