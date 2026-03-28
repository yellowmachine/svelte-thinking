CREATE TABLE "scholio"."user_spell_allowlist" (
	"user_id" text NOT NULL,
	"word" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."user_spell_allowlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_spell_allowlist_access" ON "scholio"."user_spell_allowlist" AS PERMISSIVE FOR ALL TO public USING ("scholio"."user_spell_allowlist"."user_id" = nullif(current_setting('app.current_user_id', true), ''));