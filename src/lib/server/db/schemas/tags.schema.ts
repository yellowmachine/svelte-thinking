import { text, timestamp, uniqueIndex, index, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';

const currentUserId = sql`current_setting('app.current_user_id', true)`;

export const tag = scholioSchema
	.table(
		'tag',
		(t) => ({
			id: text('id').primaryKey(),
			userId: text('user_id').notNull(),
			name: text('name').notNull()
		}),
		(t) => [
			uniqueIndex('tag_user_name_idx').on(t.userId, t.name),
			index('tag_user_idx').on(t.userId),

			pgPolicy('tag_select', { for: 'select', using: sql`${t.userId} = ${currentUserId}` }),
			pgPolicy('tag_insert', { for: 'insert', withCheck: sql`${t.userId} = ${currentUserId}` }),
			pgPolicy('tag_update', {
				for: 'update',
				using: sql`${t.userId} = ${currentUserId}`,
				withCheck: sql`${t.userId} = ${currentUserId}`
			}),
			pgPolicy('tag_delete', { for: 'delete', using: sql`${t.userId} = ${currentUserId}` })
		]
	)
	.enableRLS();

export const projectTag = scholioSchema
	.table(
		'project_tag',
		(t) => ({
			projectId: text('project_id').notNull(),
			tagId: text('tag_id').notNull()
		}),
		(t) => [
			uniqueIndex('project_tag_unique_idx').on(t.projectId, t.tagId),
			index('project_tag_project_idx').on(t.projectId),
			index('project_tag_tag_idx').on(t.tagId),

			pgPolicy('project_tag_select', {
				for: 'select',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
			}),
			pgPolicy('project_tag_insert', {
				for: 'insert',
				withCheck: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
			}),
			pgPolicy('project_tag_delete', {
				for: 'delete',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
			})
		]
	)
	.enableRLS();
