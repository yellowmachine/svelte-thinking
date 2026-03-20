CREATE TABLE "notification_preference" (
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

ALTER TABLE "notification_preference" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preference_access" ON "notification_preference"
	AS PERMISSIVE FOR ALL
	USING (user_id = nullif(current_setting('app.current_user_id', true), ''));
