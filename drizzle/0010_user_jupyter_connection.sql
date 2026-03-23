CREATE TABLE "scholio"."user_jupyter_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"encrypted_data_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."user_jupyter_connection" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_jupyter_connection_access" ON "scholio"."user_jupyter_connection" AS PERMISSIVE FOR ALL TO public USING (
	"user_id" = nullif(current_setting('app.current_user_id', true), '')
);
