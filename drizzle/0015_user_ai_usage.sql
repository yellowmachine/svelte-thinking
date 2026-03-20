CREATE TABLE "user_ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"suggestion_count" integer DEFAULT 0 NOT NULL
);
ALTER TABLE "user_ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX "user_ai_usage_user_date_idx" ON "user_ai_usage" USING btree ("user_id","date");
CREATE POLICY "user_ai_usage_access" ON "user_ai_usage" AS PERMISSIVE FOR ALL TO public USING ("user_id" = current_setting('app.current_user_id', true));
