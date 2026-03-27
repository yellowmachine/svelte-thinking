CREATE TYPE "scholio"."org_invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "scholio"."org_member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "scholio"."org_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"org_name" text,
	"invited_email" text NOT NULL,
	"invited_by" text NOT NULL,
	"token" text NOT NULL,
	"status" "scholio"."org_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "scholio"."org_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" text NOT NULL,
	"ai_task_config" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "scholio"."organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."organization_api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"encrypted_data_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."organization_api_key" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."organization_member" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"org_owner_id" text NOT NULL,
	"role" "scholio"."org_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."organization_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "scholio"."org_invitation" ADD CONSTRAINT "org_invitation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "scholio"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."organization_api_key" ADD CONSTRAINT "organization_api_key_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "scholio"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."organization_member" ADD CONSTRAINT "organization_member_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "scholio"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_invitation_unique_idx" ON "scholio"."org_invitation" USING btree ("org_id","invited_email");--> statement-breakpoint
CREATE INDEX "org_invitation_org_idx" ON "scholio"."org_invitation" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_invitation_token_idx" ON "scholio"."org_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "org_owner_idx" ON "scholio"."organization" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "org_api_key_org_idx" ON "scholio"."organization_api_key" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_member_unique_idx" ON "scholio"."organization_member" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "org_member_org_idx" ON "scholio"."organization_member" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_member_user_idx" ON "scholio"."organization_member" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "org_invitation_select" ON "scholio"."org_invitation" AS PERMISSIVE FOR SELECT TO public USING (
				current_setting('app.current_user_id', true) = ''
				OR "scholio"."org_invitation"."invited_by" = nullif(current_setting('app.current_user_id', true), '')
				OR EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = "scholio"."org_invitation"."org_id"
					AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "org_invitation_insert" ON "scholio"."org_invitation" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = "scholio"."org_invitation"."org_id"
					AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "org_invitation_update" ON "scholio"."org_invitation" AS PERMISSIVE FOR UPDATE TO public USING (current_setting('app.current_user_id', true) = '');--> statement-breakpoint
CREATE POLICY "org_invitation_delete" ON "scholio"."org_invitation" AS PERMISSIVE FOR DELETE TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = "scholio"."org_invitation"."org_id"
					AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "org_select" ON "scholio"."organization" AS PERMISSIVE FOR SELECT TO public USING (
				"scholio"."organization"."owner_id" = nullif(current_setting('app.current_user_id', true), '')
				OR EXISTS (
					SELECT 1 FROM scholio.organization_member
					WHERE organization_member.org_id = "scholio"."organization"."id"
					AND organization_member.user_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "org_insert" ON "scholio"."organization" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("scholio"."organization"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "org_update" ON "scholio"."organization" AS PERMISSIVE FOR UPDATE TO public USING ("scholio"."organization"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "org_delete" ON "scholio"."organization" AS PERMISSIVE FOR DELETE TO public USING ("scholio"."organization"."owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "org_api_key_access" ON "scholio"."organization_api_key" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = "scholio"."organization_api_key"."org_id"
					AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
CREATE POLICY "org_member_select" ON "scholio"."organization_member" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."organization_member"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "org_member_select_owner" ON "scholio"."organization_member" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."organization_member"."org_owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "org_member_insert" ON "scholio"."organization_member" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("scholio"."organization_member"."org_owner_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "org_member_insert_invite" ON "scholio"."organization_member" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('app.current_user_id', true) = '');--> statement-breakpoint
CREATE POLICY "org_member_delete" ON "scholio"."organization_member" AS PERMISSIVE FOR DELETE TO public USING ("scholio"."organization_member"."org_owner_id" = nullif(current_setting('app.current_user_id', true), '') OR "scholio"."organization_member"."user_id" = nullif(current_setting('app.current_user_id', true), ''));