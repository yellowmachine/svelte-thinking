CREATE TABLE "scholio"."user_s3_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
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
	CONSTRAINT "user_s3_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "scholio"."user_s3_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_s3_config_access" ON "scholio"."user_s3_config" AS PERMISSIVE FOR ALL TO public USING ("scholio"."user_s3_config"."user_id" = nullif(current_setting('app.current_user_id', true), ''));