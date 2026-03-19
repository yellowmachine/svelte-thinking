CREATE TABLE "project_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_photo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_photo" ADD CONSTRAINT "project_photo_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_project_idx" ON "project_photo" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "photo_uploader_idx" ON "project_photo" USING btree ("uploaded_by");--> statement-breakpoint
CREATE POLICY "photo_access" ON "project_photo" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_photo"."project_id"
					AND (
						project.owner_id = current_setting('app.current_user_id', true)
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = current_setting('app.current_user_id', true)
						)
					)
				)
			);