ALTER TYPE "scholio"."document_type" ADD VALUE 'reading_note';--> statement-breakpoint
ALTER POLICY "org_s3_config_read" ON "scholio"."org_s3_config" TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = "scholio"."org_s3_config"."org_id"
					AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
				OR EXISTS (
					SELECT 1 FROM scholio.organization_member
					WHERE organization_member.org_id = "scholio"."org_s3_config"."org_id"
					AND organization_member.user_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);--> statement-breakpoint
ALTER POLICY "org_s3_config_write" ON "scholio"."org_s3_config" TO public USING (
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = "scholio"."org_s3_config"."org_id"
					AND organization.owner_id = nullif(current_setting('app.current_user_id', true), '')
				)
			);