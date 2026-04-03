import { text, timestamp, jsonb, boolean, pgPolicy, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';

export const projectTemplate = scholioSchema.table(
	'project_template',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		type: text('type').notNull(),          // 'describe' | 'ttest' | ...
		parameters: jsonb('parameters').notNull().default({}),
		isPublic: boolean('is_public').notNull().default(false),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('template_project_idx').on(t.projectId),
		index('template_public_idx').on(t.isPublic),

		pgPolicy('template_access', {
			for: 'all',
			using: sql`
				${t.isPublic} = true
				OR EXISTS (
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
