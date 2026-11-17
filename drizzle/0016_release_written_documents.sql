-- Gives up write access to every shared document the caller holds as writer
-- (document.writer_user_id), so it goes back to the project owner.
--
-- document_update has no WITH CHECK, so its USING also checks the new row:
-- with writer_user_id NULL only the project owner passes it, and the writer
-- can't let go of a document on their own. Like the functions of
-- 0011_rls_definer_functions this one skips RLS, and it can only clear the
-- caller's own write access. Used on account deletion; returns the documents.
CREATE FUNCTION scholio.release_written_documents()
RETURNS TABLE (document_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = scholio, public
AS $$
DECLARE
	caller text := nullif(current_setting('app.current_user_id', true), '');
BEGIN
	IF caller IS NULL THEN
		RETURN;
	END IF;

	RETURN QUERY
		UPDATE scholio.document d SET writer_user_id = NULL
		WHERE d.writer_user_id = caller
		RETURNING d.id;
END;
$$;
