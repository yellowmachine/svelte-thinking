-- Who may write a shared document (document.writer_user_id), past RLS.
--
-- document_update has no WITH CHECK, so its USING also checks the new row, and
-- no change of writer_user_id ever passed it: the owner couldn't delegate,
-- move or take back write access, nor a writer give it up. RLS can't tell one
-- column from another, and the policy must still keep the owner out of the
-- content while someone else holds the document, so the change of writer goes
-- through here, with the rules of setWriter (documents.ts):
--
-- - the project owner sets it to NULL or to a collaborator whose role writes
--   (author, coauthor), whoever held it before;
-- - the current writer can only give it up (NULL);
-- - nobody else, and never on a private document.
--
-- Raises insufficient_privilege (42501) when the caller may not, and
-- invalid_parameter_value (22023) for a writer who can't write. Returns the
-- document id, or nothing when the caller can't see the document.
CREATE FUNCTION scholio.set_document_writer(p_document_id text, p_writer text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = scholio, public
AS $$
DECLARE
	caller text := nullif(current_setting('app.current_user_id', true), '');
	d record;
BEGIN
	IF caller IS NULL THEN
		RAISE EXCEPTION 'No user' USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT doc.id, doc.project_id, doc.writer_user_id, doc.is_private, p.owner_id
	INTO d
	FROM scholio.document doc
	JOIN scholio.project p ON p.id = doc.project_id
	WHERE doc.id = p_document_id;

	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	IF d.is_private THEN
		RAISE EXCEPTION 'Private documents have no writer' USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF caller = d.owner_id THEN
		IF p_writer IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM scholio.project_collaborator c
			WHERE c.project_id = d.project_id AND c.user_id = p_writer
			AND c.role IN ('author', 'coauthor')
		) THEN
			RAISE EXCEPTION 'Not a collaborator who can write' USING ERRCODE = 'invalid_parameter_value';
		END IF;
	ELSIF caller = d.writer_user_id THEN
		IF p_writer IS NOT NULL THEN
			RAISE EXCEPTION 'Only the owner can hand write access to another user'
				USING ERRCODE = 'insufficient_privilege';
		END IF;
	ELSE
		RAISE EXCEPTION 'Only the owner or the current writer can change who has write access'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	UPDATE scholio.document SET writer_user_id = p_writer, updated_at = now()
	WHERE id = p_document_id;
	RETURN p_document_id;
END;
$$;
