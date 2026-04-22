CREATE TABLE "scholio"."reference_subnote" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_id" text NOT NULL,
	"slug" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."reference_subnote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."reference_subnote" ADD CONSTRAINT "reference_subnote_reference_id_reference_id_fk" FOREIGN KEY ("reference_id") REFERENCES "scholio"."reference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subnote_ref_slug_idx" ON "scholio"."reference_subnote" USING btree ("reference_id","slug");--> statement-breakpoint
CREATE INDEX "subnote_ref_idx" ON "scholio"."reference_subnote" USING btree ("reference_id");--> statement-breakpoint
CREATE POLICY "reference_subnote_access" ON "scholio"."reference_subnote" AS PERMISSIVE FOR ALL TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.reference r
					WHERE r.id = "scholio"."reference_subnote"."reference_id"
					AND (
						r.user_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_reference pr
							INNER JOIN scholio.project p ON p.id = pr.project_id
							WHERE pr.reference_id = r.id
							AND (
								p.owner_id = nullif(current_setting('app.current_user_id', true), '')
								OR EXISTS (
									SELECT 1 FROM scholio.project_collaborator
									WHERE project_collaborator.project_id = p.id
									AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
								)
							)
						)
					)
				)
			);