import { text, timestamp, integer, pgPolicy, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';

export const projectPhoto = scholioSchema.table(
	'project_photo',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		uploadedBy: text('uploaded_by').notNull(),
		key: text('key').notNull(), // S3/MinIO object key
		url: text('url').notNull(), // public URL
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull(),
		size: integer('size').notNull(), // bytes
		description: text('description'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('photo_project_idx').on(t.projectId),
		index('photo_uploader_idx').on(t.uploadedBy),

		pgPolicy('photo_access', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = current_setting('app.current_user_id', true)
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = current_setting('app.current_user_id', true)
						)
					)
				)
			`
		})
	]
).enableRLS();
