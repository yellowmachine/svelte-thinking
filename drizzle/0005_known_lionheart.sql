CREATE TABLE "scholio"."project_interest" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_interest" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "is_searchable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scholio"."project_interest" ADD CONSTRAINT "project_interest_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_interest_unique_idx" ON "scholio"."project_interest" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_interest_project_idx" ON "scholio"."project_interest" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_interest_user_idx" ON "scholio"."project_interest" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "project_select_searchable" ON "scholio"."project" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."project"."is_searchable" = true AND nullif(current_setting('app.current_user_id', true), '') IS NOT NULL);--> statement-breakpoint
CREATE POLICY "project_interest_select" ON "scholio"."project_interest" AS PERMISSIVE FOR SELECT TO public USING (
				"scholio"."project_interest"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_interest"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "project_interest_insert" ON "scholio"."project_interest" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				"scholio"."project_interest"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND NOT EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_interest"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "project_interest_delete" ON "scholio"."project_interest" AS PERMISSIVE FOR DELETE TO public USING ("scholio"."project_interest"."user_id" = nullif(current_setting('app.current_user_id', true), ''));