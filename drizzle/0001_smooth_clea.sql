CREATE TABLE "scholio"."document_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"project_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(384) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."document_chunk" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project_requirement" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"fulfilled_document_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_requirement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "requirements_prompt" text;--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "requirements_template" text;--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "doi" text;--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "scholio"."document_chunk" ADD CONSTRAINT "document_chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_requirement" ADD CONSTRAINT "project_requirement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_requirement" ADD CONSTRAINT "project_requirement_fulfilled_document_id_document_id_fk" FOREIGN KEY ("fulfilled_document_id") REFERENCES "scholio"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_chunk_document_idx" ON "scholio"."document_chunk" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_chunk_project_idx" ON "scholio"."document_chunk" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_requirement_project_idx" ON "scholio"."project_requirement" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "document_chunk_access" ON "scholio"."document_chunk" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.document
					WHERE document.id = "scholio"."document_chunk"."document_id"
				)
			);--> statement-breakpoint
CREATE POLICY "requirement_select" ON "scholio"."project_requirement" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_requirement"."project_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = "scholio"."project_requirement"."project_id"
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "requirement_insert" ON "scholio"."project_requirement" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_requirement"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "requirement_update" ON "scholio"."project_requirement" AS PERMISSIVE FOR UPDATE TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_requirement"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "requirement_delete" ON "scholio"."project_requirement" AS PERMISSIVE FOR DELETE TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_requirement"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);