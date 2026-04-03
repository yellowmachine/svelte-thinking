import { text, timestamp, jsonb, integer, pgPolicy, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';

export const projectNotebook = scholioSchema.table(
	'project_notebook',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		importedBy: text('imported_by').notNull(),
		filename: text('filename').notNull(),
		size: integer('size').notNull(),
		source: text('source').notNull().default('file'), // 'file' | 'url'
		remoteUrl: text('remote_url'),
		kernelName: text('kernel_name'),
		languageName: text('language_name'),
		cells: jsonb('cells').notNull().default('[]'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('notebook_project_idx').on(t.projectId),

		pgPolicy('notebook_access', {
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
