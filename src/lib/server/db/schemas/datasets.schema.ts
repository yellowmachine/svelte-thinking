import { text, timestamp, integer, pgPolicy, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';

export const projectDataset = scholioSchema.table(
	'project_dataset',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		uploadedBy: text('uploaded_by').notNull(),
		key: text('key').notNull(),
		url: text('url').notNull(),
		filename: text('filename').notNull(), // original filename — used as the $ref name
		mimeType: text('mime_type').notNull(),
		size: integer('size').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('dataset_project_idx').on(t.projectId),

		pgPolicy('dataset_access', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			`
		})
	]
).enableRLS();
