import { text, timestamp, integer, boolean, index, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';
import { document } from './documents.schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

export const projectRequirement = scholioSchema.table(
	'project_requirement',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		order: integer('order').notNull().default(0),
		required: boolean('required').notNull().default(true),
		fulfilledDocumentId: text('fulfilled_document_id').references(() => document.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('project_requirement_project_idx').on(t.projectId),

		pgPolicy('requirement_select', {
			for: 'select',
			using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = ${currentUserId}
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = ${t.projectId}
							AND project_collaborator.user_id = ${currentUserId}
						)
					)
				)
			`
		}),

		pgPolicy('requirement_insert', {
			for: 'insert',
			withCheck: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),

		pgPolicy('requirement_update', {
			for: 'update',
			using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),

		pgPolicy('requirement_delete', {
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
).enableRLS();
