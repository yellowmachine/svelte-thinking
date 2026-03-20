CREATE TYPE "public"."waitlist_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reference_type" AS ENUM('article', 'book', 'inproceedings', 'incollection', 'phdthesis', 'mastersthesis', 'techreport', 'misc');--> statement-breakpoint
CREATE TABLE "user_ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"suggestion_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"message" text,
	"status" "waitlist_status" DEFAULT 'pending' NOT NULL,
	"registration_token" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_registration_token_unique" UNIQUE("registration_token")
);
--> statement-breakpoint
CREATE TABLE "project_dataset" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_dataset" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"cite_key" text NOT NULL,
	"type" "reference_type" DEFAULT 'article' NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"year" text,
	"abstract" text,
	"doi" text,
	"url" text,
	"note" text,
	"reading_notes" text,
	"journal" text,
	"volume" text,
	"issue" text,
	"pages" text,
	"publisher" text,
	"edition" text,
	"address" text,
	"isbn" text,
	"editors" jsonb DEFAULT '[]'::jsonb,
	"booktitle" text,
	"organization" text,
	"series" text,
	"school" text,
	"institution" text,
	"report_number" text,
	"extra" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_context_link" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"linked_document_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_context_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_link" (
	"id" text PRIMARY KEY NOT NULL,
	"source_document_id" text NOT NULL,
	"target_document_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"show_name" boolean DEFAULT false NOT NULL,
	"user_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ai_config" RENAME COLUMN "salt" TO "encrypted_data_key";--> statement-breakpoint
ALTER TABLE "user_ai_config" ALTER COLUMN "provider" SET DEFAULT 'openrouter';--> statement-breakpoint
ALTER TABLE "user_ai_config" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_dataset" ADD CONSTRAINT "project_dataset_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reference" ADD CONSTRAINT "project_reference_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_context_link" ADD CONSTRAINT "project_context_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_context_link" ADD CONSTRAINT "project_context_link_linked_document_id_document_id_fk" FOREIGN KEY ("linked_document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_link" ADD CONSTRAINT "document_link_source_document_id_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_link" ADD CONSTRAINT "document_link_target_document_id_document_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_usage_user_date_idx" ON "user_ai_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "dataset_project_idx" ON "project_dataset" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ref_project_key_idx" ON "project_reference" USING btree ("project_id","cite_key");--> statement-breakpoint
CREATE INDEX "ref_project_idx" ON "project_reference" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ctx_link_unique_idx" ON "project_context_link" USING btree ("project_id","linked_document_id");--> statement-breakpoint
CREATE INDEX "ctx_link_project_idx" ON "project_context_link" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_link_unique_idx" ON "document_link" USING btree ("source_document_id","target_document_id");--> statement-breakpoint
CREATE INDEX "doc_link_source_idx" ON "document_link" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "doc_link_target_idx" ON "document_link" USING btree ("target_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_project_title_idx" ON "document" USING btree ("project_id","title");--> statement-breakpoint
CREATE POLICY "document_public_read" ON "document" AS PERMISSIVE FOR SELECT TO public USING ("document"."is_public" = true);--> statement-breakpoint
CREATE POLICY "user_ai_usage_access" ON "user_ai_usage" AS PERMISSIVE FOR ALL TO public USING ("user_ai_usage"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "dataset_access" ON "project_dataset" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_dataset"."project_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "reference_access" ON "project_reference" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_reference"."project_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "context_link_access" ON "project_context_link" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_context_link"."project_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "document_link_access" ON "document_link" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM document
					JOIN project ON project.id = document.project_id
					WHERE document.id = "document_link"."source_document_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "document_link_incoming_public" ON "document_link" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (
					SELECT 1 FROM document source_doc
					WHERE source_doc.id = "document_link"."source_document_id"
					AND source_doc.is_public = true
				)
				AND EXISTS (
					SELECT 1 FROM document target_doc
					JOIN project ON project.id = target_doc.project_id
					WHERE target_doc.id = "document_link"."target_document_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
ALTER POLICY "user_ai_config_access" ON "user_ai_config" TO public USING ("user_ai_config"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
ALTER POLICY "user_profile_select" ON "user_profile" TO public USING (nullif(current_setting('app.current_user_id', true), '') IS NOT NULL);--> statement-breakpoint
ALTER POLICY "user_profile_modify" ON "user_profile" TO public USING ("user_profile"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
ALTER POLICY "project_select" ON "project" TO public USING (
				"project"."owner_id" = nullif(current_setting('app.current_user_id', true), '')
				OR EXISTS (
					SELECT 1 FROM project_collaborator
					WHERE project_collaborator.project_id = "project"."id"
					AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
ALTER POLICY "project_insert" ON "project" TO public WITH CHECK ("project"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
ALTER POLICY "project_update" ON "project" TO public USING ("project"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
ALTER POLICY "project_delete" ON "project" TO public USING ("project"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
ALTER POLICY "collaborator_select" ON "project_collaborator" TO public USING ("project_collaborator"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
ALTER POLICY "collaborator_insert" ON "project_collaborator" TO public WITH CHECK (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_collaborator"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
ALTER POLICY "collaborator_update" ON "project_collaborator" TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_collaborator"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
ALTER POLICY "collaborator_delete" ON "project_collaborator" TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_collaborator"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);