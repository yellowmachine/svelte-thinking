CREATE TYPE "public"."project_role" AS ENUM('owner', 'author', 'coauthor', 'reviewer', 'commenter');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('paper', 'notes', 'outline', 'bibliography', 'supplementary');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."comment_type" AS ENUM('general', 'inline');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."ai_suggestion_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ai_suggestion_type" AS ENUM('grammar', 'style', 'structure', 'clarity', 'citation');--> statement-breakpoint
CREATE TABLE "user_ai_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"salt" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_ai_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_ai_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text,
	"bio" text,
	"institution" text,
	"orcid" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_collaborator" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "project_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_collaborator" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"type" "document_type" DEFAULT 'paper' NOT NULL,
	"current_version_id" text,
	"draft_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"change_description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"author_id" text NOT NULL,
	"type" "comment_type" DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"anchor_text" text,
	"line_start" integer,
	"line_end" integer,
	"character_start" integer,
	"character_end" integer,
	"status" "comment_status" DEFAULT 'open' NOT NULL,
	"parent_comment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"invited_by" text NOT NULL,
	"role" "project_role" NOT NULL,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "project_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"type" "ai_suggestion_type" NOT NULL,
	"original_text" text,
	"suggested_text" text NOT NULL,
	"explanation" text,
	"status" "ai_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_suggestion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_collaborator" ADD CONSTRAINT "project_collaborator_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_ai_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_owner_idx" ON "project" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_collaborator_unique_idx" ON "project_collaborator" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_collaborator_project_idx" ON "project_collaborator" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_collaborator_user_idx" ON "project_collaborator" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_project_idx" ON "document" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "document_version_document_idx" ON "document_version" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "comment_document_status_idx" ON "comment" USING btree ("document_id","status");--> statement-breakpoint
CREATE INDEX "invitation_project_idx" ON "project_invitation" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_conversation_project_idx" ON "ai_conversation" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_message_conversation_idx" ON "ai_message" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_suggestion_document_idx" ON "ai_suggestion" USING btree ("document_id","status");--> statement-breakpoint
CREATE POLICY "user_ai_config_access" ON "user_ai_config" AS PERMISSIVE FOR ALL TO public USING ("user_ai_config"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_profile_select" ON "user_profile" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.current_user_id', true) IS NOT NULL);--> statement-breakpoint
CREATE POLICY "user_profile_modify" ON "user_profile" AS PERMISSIVE FOR ALL TO public USING ("user_profile"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "project_select" ON "project" AS PERMISSIVE FOR SELECT TO public USING (
				"project"."owner_id" = current_setting('app.current_user_id', true)
				OR EXISTS (
					SELECT 1 FROM project_collaborator
					WHERE project_collaborator.project_id = "project"."id"
					AND project_collaborator.user_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "project_insert" ON "project" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("project"."owner_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "project_update" ON "project" AS PERMISSIVE FOR UPDATE TO public USING ("project"."owner_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "project_delete" ON "project" AS PERMISSIVE FOR DELETE TO public USING ("project"."owner_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "collaborator_select" ON "project_collaborator" AS PERMISSIVE FOR SELECT TO public USING (
				"project_collaborator"."user_id" = current_setting('app.current_user_id', true)
				OR EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_collaborator"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "collaborator_modify" ON "project_collaborator" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_collaborator"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "collaborator_insert_invite" ON "project_collaborator" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('app.current_user_id', true) = '');--> statement-breakpoint
CREATE POLICY "document_access" ON "document" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "document"."project_id"
					AND (
						project.owner_id = current_setting('app.current_user_id', true)
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = current_setting('app.current_user_id', true)
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "document_version_access" ON "document_version" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM document
					WHERE document.id = "document_version"."document_id"
				)
			);--> statement-breakpoint
CREATE POLICY "comment_select" ON "comment" AS PERMISSIVE FOR SELECT TO public USING (
				EXISTS (SELECT 1 FROM document WHERE document.id = "comment"."document_id")
			);--> statement-breakpoint
CREATE POLICY "comment_insert" ON "comment" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				"comment"."author_id" = current_setting('app.current_user_id', true)
				AND EXISTS (SELECT 1 FROM document WHERE document.id = "comment"."document_id")
			);--> statement-breakpoint
CREATE POLICY "comment_modify" ON "comment" AS PERMISSIVE FOR UPDATE TO public USING ("comment"."author_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "comment_delete" ON "comment" AS PERMISSIVE FOR DELETE TO public USING ("comment"."author_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "invitation_select" ON "project_invitation" AS PERMISSIVE FOR SELECT TO public USING (
				current_setting('app.current_user_id', true) = ''
				OR "project_invitation"."invited_by" = current_setting('app.current_user_id', true)
				OR EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_invitation"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "invitation_modify" ON "project_invitation" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_invitation"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "invitation_update" ON "project_invitation" AS PERMISSIVE FOR UPDATE TO public USING (
				current_setting('app.current_user_id', true) = ''
				OR EXISTS (
					SELECT 1 FROM project
					WHERE project.id = "project_invitation"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
CREATE POLICY "ai_conversation_access" ON "ai_conversation" AS PERMISSIVE FOR ALL TO public USING ("ai_conversation"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "ai_message_access" ON "ai_message" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM ai_conversation
					WHERE ai_conversation.id = "ai_message"."conversation_id"
				)
			);--> statement-breakpoint
CREATE POLICY "ai_suggestion_access" ON "ai_suggestion" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM document
					WHERE document.id = "ai_suggestion"."document_id"
				)
			);