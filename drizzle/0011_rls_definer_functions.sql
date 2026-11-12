-- Operations that cross users and that RLS (rightly) does not allow to the app
-- role. Each one is a SECURITY DEFINER function: it runs as the owner of the
-- tables, so it skips RLS, and does its own permission check instead. The app
-- never gets a connection that skips RLS; these functions are the only doors.
--
-- They read the caller from app.current_user_id, so the app calls them inside
-- withRLS (except unsubscribe_by_token, which is for logged-out email links).

-- Owner and collaborators of a project (or only the owner). Helper of
-- notification_recipients. Not SECURITY DEFINER: called from there it runs as
-- the table owner; called directly by the app role, RLS still filters it.
CREATE FUNCTION scholio._project_members(p_project_id text, p_only_owner boolean)
RETURNS TABLE (uid text)
LANGUAGE sql
STABLE
SET search_path = scholio, public
AS $$
	SELECT p.owner_id FROM scholio.project p WHERE p.id = p_project_id
	UNION
	SELECT c.user_id FROM scholio.project_collaborator c
	WHERE c.project_id = p_project_id AND NOT p_only_owner;
$$;
--> statement-breakpoint

-- ── 1. Who to email about activity in a project ─────────────────────────────
-- Returns the members of p_project_id (owner and collaborators, or only the
-- owner) other than the caller, with their email and notification preference.
-- Creates the preference row (and its unsubscribe token) when missing.
-- Empty when the caller is not a member of the project.
CREATE FUNCTION scholio.notification_recipients(p_project_id text, p_only_owner boolean)
RETURNS TABLE (
	user_id text,
	email text,
	comment_emails boolean,
	commit_emails boolean,
	unsubscribe_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = scholio, public
AS $$
#variable_conflict use_column
DECLARE
	caller text := nullif(current_setting('app.current_user_id', true), '');
BEGIN
	IF caller IS NULL OR NOT EXISTS (
		SELECT 1 FROM scholio.project p WHERE p.id = p_project_id AND p.owner_id = caller
		UNION ALL
		SELECT 1 FROM scholio.project_collaborator c
		WHERE c.project_id = p_project_id AND c.user_id = caller
	) THEN
		RETURN;
	END IF;

	INSERT INTO scholio.notification_preference (id, user_id, project_id, unsubscribe_token)
		SELECT gen_random_uuid()::text, r.uid, p_project_id, gen_random_uuid()::text
		FROM scholio._project_members(p_project_id, p_only_owner) r
		WHERE r.uid <> caller
	ON CONFLICT (user_id, project_id) DO NOTHING;

	RETURN QUERY
		SELECT r.uid, u.email, np.comment_emails, np.commit_emails, np.unsubscribe_token
		FROM scholio._project_members(p_project_id, p_only_owner) r
		JOIN public."user" u ON u.id = r.uid
		JOIN scholio.notification_preference np
			ON np.user_id = r.uid AND np.project_id = p_project_id
		WHERE r.uid <> caller;
END;
$$;
--> statement-breakpoint

-- ── 2. Unsubscribe link in notification emails (no session needed) ──────────
-- Turns off comment and commit emails for that user and project.
-- Returns 'unsubscribed', 'already' or 'invalid'.
CREATE FUNCTION scholio.unsubscribe_by_token(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = scholio, public
AS $$
DECLARE
	was_on boolean;
BEGIN
	SELECT (np.comment_emails OR np.commit_emails) INTO was_on
	FROM scholio.notification_preference np
	WHERE np.unsubscribe_token = p_token;

	IF NOT FOUND THEN
		RETURN 'invalid';
	END IF;
	IF NOT was_on THEN
		RETURN 'already';
	END IF;

	UPDATE scholio.notification_preference
	SET comment_emails = false, commit_emails = false, updated_at = now()
	WHERE unsubscribe_token = p_token;
	RETURN 'unsubscribed';
END;
$$;
--> statement-breakpoint

-- ── 3. An organization's AI keys, for its members ───────────────────────────
-- organization_api_key is readable by the org owner only (key material). The
-- members use those keys for AI calls on org projects, so they get the enabled
-- keys through here. Empty when the caller is neither owner nor member.
CREATE FUNCTION scholio.org_ai_keys(p_org_id text)
RETURNS TABLE (
	id text,
	encrypted_api_key text,
	encrypted_data_key text,
	iv text,
	auth_tag text,
	enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = scholio, public
AS $$
#variable_conflict use_column
DECLARE
	caller text := nullif(current_setting('app.current_user_id', true), '');
BEGIN
	IF caller IS NULL OR NOT EXISTS (
		SELECT 1 FROM scholio.organization o WHERE o.id = p_org_id AND o.owner_id = caller
		UNION ALL
		SELECT 1 FROM scholio.organization_member m
		WHERE m.org_id = p_org_id AND m.user_id = caller
	) THEN
		RETURN;
	END IF;

	RETURN QUERY
		SELECT k.id, k.encrypted_api_key, k.encrypted_data_key, k.iv, k.auth_tag, k.enabled
		FROM scholio.organization_api_key k
		WHERE k.org_id = p_org_id AND k.enabled;
END;
$$;
