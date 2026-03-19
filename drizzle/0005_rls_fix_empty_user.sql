-- Fix user_profile_select policy to reject both NULL and empty string.
-- current_setting('app.current_user_id', true) returns '' when the GUC was
-- previously set in the session; nullif converts '' to NULL so IS NOT NULL
-- correctly blocks unauthenticated requests in both production and tests.

DROP POLICY IF EXISTS "user_profile_select" ON "user_profile";--> statement-breakpoint
CREATE POLICY "user_profile_select" ON "user_profile"
  AS PERMISSIVE FOR SELECT TO public
  USING (nullif(current_setting('app.current_user_id', true), '') IS NOT NULL);
