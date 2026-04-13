CREATE TABLE "scholio"."document_version_share" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"document_id" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_version_share_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "scholio"."document_version_share" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."document_version_share" ADD CONSTRAINT "document_version_share_version_id_document_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "scholio"."document_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."document_version_share" ADD CONSTRAINT "document_version_share_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dvshare_version_idx" ON "scholio"."document_version_share" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "dvshare_document_idx" ON "scholio"."document_version_share" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dvshare_token_idx" ON "scholio"."document_version_share" USING btree ("token");--> statement-breakpoint
CREATE POLICY "dvshare_public_read" ON "scholio"."document_version_share" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "dvshare_owner_write" ON "scholio"."document_version_share" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.document
					WHERE document.id = "scholio"."document_version_share"."document_id"
					AND document.owner_user_id = current_setting('app.current_user_id', true)
				)
			);--> statement-breakpoint
ALTER POLICY "invitation_select" ON "scholio"."project_invitation" TO public USING (
				current_setting('app.current_user_id', true) = ''
				OR "scholio"."project_invitation"."invited_by" = current_setting('app.current_user_id', true)
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_invitation"."project_id"
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
				OR EXISTS (
					SELECT 1 FROM "user"
					WHERE "user".id = current_setting('app.current_user_id', true)
					AND "user".email = "scholio"."project_invitation"."invited_email"
				)
			);