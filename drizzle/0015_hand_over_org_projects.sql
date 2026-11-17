-- Account deletion: the caller's projects in organizations owned by someone
-- else go to that organization's owner instead of being deleted with the
-- caller's account. They hold other members' work, and their files live in the
-- organization's bucket, which stays.
--
-- RLS only lets a project's owner touch it, and never hands it to another user,
-- so this is a SECURITY DEFINER function, like the ones of
-- 0011_rls_definer_functions. It can only give away the caller's own projects,
-- and only to the owner of the organization they already belong to.
--
-- For each project: the owner's collaborator row (role 'owner') moves to the
-- new owner, replacing any role they had in it; the denormalized
-- owner_user_id of the collaborators follows; a document the caller held as
-- writer goes back to the owner. Returns the ids of the projects handed over.
CREATE FUNCTION scholio.hand_over_org_projects()
RETURNS TABLE (project_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = scholio, public
AS $$
#variable_conflict use_column
DECLARE
	caller text := nullif(current_setting('app.current_user_id', true), '');
	p record;
BEGIN
	IF caller IS NULL THEN
		RETURN;
	END IF;

	FOR p IN
		SELECT pr.id, o.owner_id AS new_owner
		FROM scholio.project pr
		JOIN scholio.organization o ON o.id = pr.org_id
		WHERE pr.owner_id = caller AND o.owner_id <> caller
	LOOP
		DELETE FROM scholio.project_collaborator c
		WHERE c.project_id = p.id AND c.user_id = p.new_owner;

		UPDATE scholio.project_collaborator c SET user_id = p.new_owner
		WHERE c.project_id = p.id AND c.user_id = caller AND c.role = 'owner';
		IF NOT FOUND THEN
			INSERT INTO scholio.project_collaborator (id, project_id, user_id, owner_user_id, role)
			VALUES (gen_random_uuid()::text, p.id, p.new_owner, p.new_owner, 'owner');
		END IF;

		DELETE FROM scholio.project_collaborator c
		WHERE c.project_id = p.id AND c.user_id = caller;

		UPDATE scholio.project_collaborator c SET owner_user_id = p.new_owner
		WHERE c.project_id = p.id;

		UPDATE scholio.document d SET writer_user_id = NULL
		WHERE d.project_id = p.id AND d.writer_user_id = caller;

		UPDATE scholio.project pr SET owner_id = p.new_owner, updated_at = now()
		WHERE pr.id = p.id;

		project_id := p.id;
		RETURN NEXT;
	END LOOP;
END;
$$;
