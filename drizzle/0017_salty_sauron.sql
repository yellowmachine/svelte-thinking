CREATE TABLE "scholio"."org_s3_config" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"bucket" text NOT NULL,
	"region" text DEFAULT 'us-east-1' NOT NULL,
	"public_url" text,
	"encrypted_credentials" text NOT NULL,
	"encrypted_data_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_s3_config_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "scholio"."org_s3_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."org_s3_config" ADD CONSTRAINT "org_s3_config_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "scholio"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_s3_config_org_idx" ON "scholio"."org_s3_config" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "org_s3_config_read" ON "scholio"."org_s3_config" AS PERMISSIVE FOR SELECT TO public USING (
			EXISTS (
				SELECT 1 FROM scholio.organization
				WHERE organization.id = "scholio"."org_s3_config"."org_id"
				AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
			)
			OR EXISTS (
				SELECT 1 FROM scholio.organization_member
				WHERE organization_member.org_id = "scholio"."org_s3_config"."org_id"
				AND organization_member.user_id = nullif(current_setting('app.current_user_id', true), '')
			)
		);--> statement-breakpoint
CREATE POLICY "org_s3_config_write" ON "scholio"."org_s3_config" AS PERMISSIVE FOR ALL TO public USING (
			EXISTS (
				SELECT 1 FROM scholio.organization
				WHERE organization.id = "scholio"."org_s3_config"."org_id"
				AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
			)
		);
