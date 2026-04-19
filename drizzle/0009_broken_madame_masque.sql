CREATE TABLE "scholio"."reference" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cite_key" text NOT NULL,
	"type" "scholio"."reference_type" DEFAULT 'article' NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"year" text,
	"abstract" text,
	"doi" text,
	"url" text,
	"note" text,
	"reading_notes_doc_id" text,
	"pdf_key" text,
	"pdf_url" text,
	"journal" text,
	"volume" text,
	"issue" text,
	"pages" text,
	"publisher" text,
	"edition" text,
	"address" text,
	"isbn" text,
	"editors" jsonb DEFAULT '[]'::jsonb,
	"booktitle" text,
	"organization" text,
	"series" text,
	"school" text,
	"institution" text,
	"report_number" text,
	"extra" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP CONSTRAINT "project_reference_reading_notes_doc_id_document_id_fk";
--> statement-breakpoint
DROP INDEX "scholio"."ref_project_key_idx";--> statement-breakpoint
DROP INDEX "scholio"."ref_project_idx";--> statement-breakpoint

-- DATA MIGRATION step 1: copy all existing rows into the new user-scoped reference table.
-- user_id is derived from the project owner.
INSERT INTO "scholio"."reference" (
    id, user_id, cite_key, type, title, authors, year, abstract, doi, url, note,
    reading_notes_doc_id, pdf_key, pdf_url, journal, volume, issue, pages,
    publisher, edition, address, isbn, editors, booktitle, organization, series,
    school, institution, report_number, extra, created_at, updated_at
)
SELECT
    pr.id,
    p.owner_id,
    pr.cite_key,
    pr.type,
    pr.title,
    pr.authors,
    pr.year,
    pr.abstract,
    pr.doi,
    pr.url,
    pr.note,
    pr.reading_notes_doc_id,
    pr.pdf_key,
    pr.pdf_url,
    pr.journal,
    pr.volume,
    pr.issue,
    pr.pages,
    pr.publisher,
    pr.edition,
    pr.address,
    pr.isbn,
    pr.editors,
    pr.booktitle,
    pr.organization,
    pr.series,
    pr.school,
    pr.institution,
    pr.report_number,
    pr.extra,
    pr.created_at,
    pr.updated_at
FROM "scholio"."project_reference" pr
JOIN "scholio"."project" p ON p.id = pr.project_id;
--> statement-breakpoint

-- DATA MIGRATION step 2: add reference_id as nullable first, then populate it
-- (same id value — the reference keeps its original PK).
ALTER TABLE "scholio"."project_reference" ADD COLUMN "reference_id" text;
--> statement-breakpoint
UPDATE "scholio"."project_reference" SET "reference_id" = "id";
--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" ALTER COLUMN "reference_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP CONSTRAINT "project_reference_pkey";
--> statement-breakpoint

ALTER TABLE "scholio"."reference" ADD CONSTRAINT "reference_reading_notes_doc_id_document_id_fk" FOREIGN KEY ("reading_notes_doc_id") REFERENCES "scholio"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Deduplicate reference rows: same user may have used the same cite_key across
-- multiple projects, producing duplicate (user_id, cite_key) pairs after the
-- INSERT above. Keep the earliest entry and remap project_reference accordingly.
WITH keepers AS (
    SELECT DISTINCT ON (user_id, cite_key) id AS keep_id, user_id, cite_key
    FROM "scholio"."reference"
    ORDER BY user_id, cite_key, created_at, id
),
duplicates AS (
    SELECT r.id AS dup_id, k.keep_id
    FROM "scholio"."reference" r
    JOIN keepers k ON k.user_id = r.user_id AND k.cite_key = r.cite_key
    WHERE r.id <> k.keep_id
)
UPDATE "scholio"."project_reference" pr
SET "reference_id" = d.keep_id
FROM duplicates d
WHERE pr."reference_id" = d.dup_id;
--> statement-breakpoint
DELETE FROM "scholio"."reference" r
USING (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, cite_key ORDER BY created_at, id) AS rn
    FROM "scholio"."reference"
) ranked
WHERE ranked.id = r.id AND ranked.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "ref_user_key_idx" ON "scholio"."reference" USING btree ("user_id","cite_key");--> statement-breakpoint
CREATE INDEX "ref_user_idx" ON "scholio"."reference" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" ADD CONSTRAINT "project_reference_reference_id_reference_id_fk" FOREIGN KEY ("reference_id") REFERENCES "scholio"."reference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proj_ref_project_idx" ON "scholio"."project_reference" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" ADD CONSTRAINT "project_reference_reference_id_project_id_pk" PRIMARY KEY("reference_id","project_id");--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "cite_key";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "authors";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "year";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "abstract";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "doi";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "note";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "reading_notes_doc_id";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "pdf_key";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "pdf_url";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "journal";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "volume";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "issue";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "pages";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "publisher";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "edition";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "isbn";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "editors";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "booktitle";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "organization";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "series";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "school";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "institution";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "report_number";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "extra";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "scholio"."project_reference" DROP COLUMN "updated_at";--> statement-breakpoint
DROP POLICY "reference_access" ON "scholio"."project_reference" CASCADE;--> statement-breakpoint
CREATE POLICY "project_reference_access" ON "scholio"."project_reference" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = "scholio"."project_reference"."project_id"
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);--> statement-breakpoint
CREATE POLICY "reference_access" ON "scholio"."reference" AS PERMISSIVE FOR ALL TO public USING (
				"scholio"."reference"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				OR EXISTS (
					SELECT 1 FROM scholio.project_reference pr
					INNER JOIN scholio.project p ON p.id = pr.project_id
					WHERE pr.reference_id = "scholio"."reference"."id"
					AND (
						p.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = p.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			);
