CREATE TABLE "scholio"."project_tag" (
	"project_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."tag" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "project_tag_unique_idx" ON "scholio"."project_tag" USING btree ("project_id","tag_id");--> statement-breakpoint
CREATE INDEX "project_tag_project_idx" ON "scholio"."project_tag" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tag_tag_idx" ON "scholio"."project_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_user_name_idx" ON "scholio"."tag" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "tag_user_idx" ON "scholio"."tag" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "project_tag_select" ON "scholio"."project_tag" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_tag"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "project_tag_insert" ON "scholio"."project_tag" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_tag"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "project_tag_delete" ON "scholio"."project_tag" AS PERMISSIVE FOR DELETE TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_tag"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "tag_select" ON "scholio"."tag" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."tag"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tag_insert" ON "scholio"."tag" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("scholio"."tag"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tag_delete" ON "scholio"."tag" AS PERMISSIVE FOR DELETE TO public USING ("scholio"."tag"."user_id" = current_setting('app.current_user_id', true));