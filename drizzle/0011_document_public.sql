ALTER TABLE "document" ADD COLUMN "is_public" boolean NOT NULL DEFAULT false;

CREATE POLICY "document_public_read" ON "document"
  FOR SELECT
  USING (is_public = true);
