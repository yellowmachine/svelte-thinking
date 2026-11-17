-- Projects left pointing at an organization that no longer exists (deleted by
-- its owner, or with the owner's account) go back to being personal projects.
UPDATE "scholio"."project" SET "org_id" = NULL
WHERE "org_id" IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM "scholio"."organization" o WHERE o."id" = "project"."org_id");--> statement-breakpoint
ALTER TABLE "scholio"."project" ADD CONSTRAINT "project_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "scholio"."organization"("id") ON DELETE set null ON UPDATE no action;
