CREATE SCHEMA IF NOT EXISTS "scholio";
--> statement-breakpoint
CREATE TYPE "scholio"."plan" AS ENUM('free', 'pro', 'team');--> statement-breakpoint
CREATE TYPE "scholio"."project_role" AS ENUM('owner', 'author', 'coauthor', 'reviewer', 'commenter');--> statement-breakpoint
CREATE TYPE "scholio"."project_status" AS ENUM('draft', 'active', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "scholio"."document_type" AS ENUM('paper', 'notes', 'outline', 'bibliography', 'supplementary');--> statement-breakpoint
CREATE TYPE "scholio"."comment_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "scholio"."comment_type" AS ENUM('general', 'inline');--> statement-breakpoint
CREATE TYPE "scholio"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "scholio"."ai_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "scholio"."ai_suggestion_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "scholio"."ai_suggestion_type" AS ENUM('grammar', 'style', 'structure', 'clarity', 'citation');--> statement-breakpoint
CREATE TYPE "scholio"."waitlist_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "scholio"."reference_type" AS ENUM('article', 'book', 'inproceedings', 'incollection', 'phdthesis', 'mastersthesis', 'techreport', 'misc');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scholio"."notification_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"comment_emails" boolean DEFAULT true NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_unsubscribe_token_unique" UNIQUE("unsubscribe_token"),
	CONSTRAINT "notification_preference_user_id_project_id_unique" UNIQUE("user_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "scholio"."notification_preference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."user_ai_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"encrypted_data_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_ai_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "scholio"."user_ai_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text,
	"bio" text,
	"institution" text,
	"orcid" text,
	"stripe_customer_id" text,
	"plan" "scholio"."plan" DEFAULT 'free' NOT NULL,
	"plan_status" text DEFAULT 'active',
	"plan_current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_profile_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"notes" text,
	"status" "scholio"."project_status" DEFAULT 'draft' NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project_collaborator" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "scholio"."project_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_collaborator" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."document" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"type" "scholio"."document_type" DEFAULT 'paper' NOT NULL,
	"current_version_id" text,
	"draft_content" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."document_version" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"change_description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."document_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."comment" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"author_id" text NOT NULL,
	"type" "scholio"."comment_type" DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"anchor_text" text,
	"line_start" integer,
	"line_end" integer,
	"character_start" integer,
	"character_end" integer,
	"status" "scholio"."comment_status" DEFAULT 'open' NOT NULL,
	"parent_comment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"invited_by" text NOT NULL,
	"role" "scholio"."project_role" NOT NULL,
	"token" text NOT NULL,
	"status" "scholio"."invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."ai_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."ai_conversation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."ai_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "scholio"."ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."ai_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."ai_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"type" "scholio"."ai_suggestion_type" NOT NULL,
	"original_text" text,
	"suggested_text" text NOT NULL,
	"explanation" text,
	"status" "scholio"."ai_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."ai_suggestion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."user_ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"suggestion_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."user_ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project_photo" (
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
ALTER TABLE "scholio"."project_photo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"message" text,
	"status" "scholio"."waitlist_status" DEFAULT 'pending' NOT NULL,
	"registration_token" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_registration_token_unique" UNIQUE("registration_token")
);
--> statement-breakpoint
CREATE TABLE "scholio"."project_dataset" (
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
ALTER TABLE "scholio"."project_dataset" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"cite_key" text NOT NULL,
	"type" "scholio"."reference_type" DEFAULT 'article' NOT NULL,
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
ALTER TABLE "scholio"."project_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."project_context_link" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"linked_document_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."project_context_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."document_link" (
	"id" text PRIMARY KEY NOT NULL,
	"source_document_id" text NOT NULL,
	"target_document_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."document_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"show_name" boolean DEFAULT false NOT NULL,
	"user_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_collaborator" ADD CONSTRAINT "project_collaborator_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."document" ADD CONSTRAINT "document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."comment" ADD CONSTRAINT "comment_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_invitation" ADD CONSTRAINT "project_invitation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."ai_conversation" ADD CONSTRAINT "ai_conversation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."ai_message" ADD CONSTRAINT "ai_message_conversation_id_ai_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "scholio"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."ai_suggestion" ADD CONSTRAINT "ai_suggestion_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_photo" ADD CONSTRAINT "project_photo_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_dataset" ADD CONSTRAINT "project_dataset_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" ADD CONSTRAINT "project_reference_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_context_link" ADD CONSTRAINT "project_context_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "scholio"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."project_context_link" ADD CONSTRAINT "project_context_link_linked_document_id_document_id_fk" FOREIGN KEY ("linked_document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."document_link" ADD CONSTRAINT "document_link_source_document_id_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."document_link" ADD CONSTRAINT "document_link_target_document_id_document_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "project_owner_idx" ON "scholio"."project" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_collaborator_unique_idx" ON "scholio"."project_collaborator" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_collaborator_project_idx" ON "scholio"."project_collaborator" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_collaborator_user_idx" ON "scholio"."project_collaborator" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_project_idx" ON "scholio"."document" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_project_title_idx" ON "scholio"."document" USING btree ("project_id","title");--> statement-breakpoint
CREATE INDEX "document_version_document_idx" ON "scholio"."document_version" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "comment_document_status_idx" ON "scholio"."comment" USING btree ("document_id","status");--> statement-breakpoint
CREATE INDEX "invitation_project_idx" ON "scholio"."project_invitation" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_conversation_project_idx" ON "scholio"."ai_conversation" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_message_conversation_idx" ON "scholio"."ai_message" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_suggestion_document_idx" ON "scholio"."ai_suggestion" USING btree ("document_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_usage_user_date_idx" ON "scholio"."user_ai_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "photo_project_idx" ON "scholio"."project_photo" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "photo_uploader_idx" ON "scholio"."project_photo" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "dataset_project_idx" ON "scholio"."project_dataset" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ref_project_key_idx" ON "scholio"."project_reference" USING btree ("project_id","cite_key");--> statement-breakpoint
CREATE INDEX "ref_project_idx" ON "scholio"."project_reference" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ctx_link_unique_idx" ON "scholio"."project_context_link" USING btree ("project_id","linked_document_id");--> statement-breakpoint
CREATE INDEX "ctx_link_project_idx" ON "scholio"."project_context_link" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_link_unique_idx" ON "scholio"."document_link" USING btree ("source_document_id","target_document_id");--> statement-breakpoint
CREATE INDEX "doc_link_source_idx" ON "scholio"."document_link" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "doc_link_target_idx" ON "scholio"."document_link" USING btree ("target_document_id");--> statement-breakpoint
CREATE POLICY "notification_preference_access" ON "scholio"."notification_preference" AS PERMISSIVE FOR ALL TO public USING ("scholio"."notification_preference"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "user_ai_config_access" ON "scholio"."user_ai_config" AS PERMISSIVE FOR ALL TO public USING ("scholio"."user_ai_config"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "user_profile_select" ON "scholio"."user_profile" AS PERMISSIVE FOR SELECT TO public USING (nullif(current_setting('app.current_user_id', true), '') IS NOT NULL);--> statement-breakpoint
CREATE POLICY "user_profile_modify" ON "scholio"."user_profile" AS PERMISSIVE FOR ALL TO public USING ("scholio"."user_profile"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "project_select" ON "scholio"."project" AS PERMISSIVE FOR SELECT TO public USING (
				"scholio"."project"."owner_id" = nullif(current_setting('app.current_user_id', true), '')
				OR EXISTS (
					SELECT 1 FROM scholio.project_collaborator
					WHERE project_collaborator.project_id = "scholio"."project"."id"
					AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "project_insert" ON "scholio"."project" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("scholio"."project"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "project_update" ON "scholio"."project" AS PERMISSIVE FOR UPDATE TO public USING ("scholio"."project"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "project_delete" ON "scholio"."project" AS PERMISSIVE FOR DELETE TO public USING ("scholio"."project"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "collaborator_select" ON "scholio"."project_collaborator" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."project_collaborator"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "collaborator_insert" ON "scholio"."project_collaborator" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_collaborator"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "collaborator_update" ON "scholio"."project_collaborator" AS PERMISSIVE FOR UPDATE TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_collaborator"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "collaborator_delete" ON "scholio"."project_collaborator" AS PERMISSIVE FOR DELETE TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_collaborator"."project_id"
					AND project.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "collaborator_insert_invite" ON "scholio"."project_collaborator" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('app.current_user_id', true) = '');--> statement-breakpoint
CREATE POLICY "document_access" ON "scholio"."document" AS PERMISSIVE FOR ALL TO public USING (
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
CREATE POLICY "document_public_read" ON "scholio"."document" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."document"."is_public" = true);--> statement-breakpoint
CREATE POLICY "document_version_access" ON "scholio"."document_version" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.document
					WHERE document.id = "scholio"."document_version"."document_id"
				)
			);--> statement-breakpoint
CREATE POLICY "comment_select" ON "scholio"."comment" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (SELECT 1 FROM scholio.document WHERE document.id = "scholio"."comment"."document_id")
			);--> statement-breakpoint
CREATE POLICY "comment_insert" ON "scholio"."comment" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				"scholio"."comment"."author_id" = current_setting('app.current_user_id', true)
				AND EXISTS (SELECT 1 FROM scholio.document WHERE document.id = "scholio"."comment"."document_id")
			);--> statement-breakpoint
CREATE POLICY "comment_modify" ON "scholio"."comment" AS PERMISSIVE FOR UPDATE TO public USING ("scholio"."comment"."author_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "comment_delete" ON "scholio"."comment" AS PERMISSIVE FOR DELETE TO public USING ("scholio"."comment"."author_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "invitation_select" ON "scholio"."project_invitation" AS PERMISSIVE FOR SELECT TO public USING (
				current_setting('app.current_user_id', true) = ''
				OR "scholio"."project_invitation"."invited_by" = current_setting('app.current_user_id', true)
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_invitation"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "invitation_modify" ON "scholio"."project_invitation" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_invitation"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "invitation_update" ON "scholio"."project_invitation" AS PERMISSIVE FOR UPDATE TO public USING (
				current_setting('app.current_user_id', true) = ''
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_invitation"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "ai_conversation_access" ON "scholio"."ai_conversation" AS PERMISSIVE FOR ALL TO public USING ("scholio"."ai_conversation"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "ai_message_access" ON "scholio"."ai_message" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.ai_conversation
					WHERE ai_conversation.id = "scholio"."ai_message"."conversation_id"
				)
			);--> statement-breakpoint
CREATE POLICY "ai_suggestion_access" ON "scholio"."ai_suggestion" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.document
					WHERE document.id = "scholio"."ai_suggestion"."document_id"
				)
			);--> statement-breakpoint
CREATE POLICY "user_ai_usage_access" ON "scholio"."user_ai_usage" AS PERMISSIVE FOR ALL TO public USING ("scholio"."user_ai_usage"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "photo_access" ON "scholio"."project_photo" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_photo"."project_id"
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
CREATE POLICY "dataset_access" ON "scholio"."project_dataset" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_dataset"."project_id"
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
CREATE POLICY "reference_access" ON "scholio"."project_reference" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_reference"."project_id"
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
CREATE POLICY "context_link_access" ON "scholio"."project_context_link" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_context_link"."project_id"
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
CREATE POLICY "document_link_access" ON "scholio"."document_link" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.document
					JOIN scholio.project ON project.id = document.project_id
					WHERE document.id = "scholio"."document_link"."source_document_id"
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
CREATE POLICY "document_link_incoming_public" ON "scholio"."document_link" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.document source_doc
					WHERE source_doc.id = "scholio"."document_link"."source_document_id"
					AND source_doc.is_public = true
				)
				AND EXISTS (
					SELECT 1 FROM scholio.document target_doc
					JOIN scholio.project ON project.id = target_doc.project_id
					WHERE target_doc.id = "scholio"."document_link"."target_document_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);