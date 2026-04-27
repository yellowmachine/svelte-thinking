import { text, timestamp, boolean, index, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';

export const issueStatusEnum = scholioSchema.enum('issue_status', [
	'open',
	'in_progress',
	'closed'
]);

export const issuePriorityEnum = scholioSchema.enum('issue_priority', [
	'low',
	'medium',
	'high',
	'critical'
]);

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

export const issue = scholioSchema
	.table(
		'issue',
		{
			id: text('id').primaryKey(),
			projectId: text('project_id')
				.notNull()
				.references(() => project.id, { onDelete: 'cascade' }),
			title: text('title').notNull(),
			content: text('content'),
			status: issueStatusEnum('status').notNull().default('open'),
			priority: issuePriorityEnum('priority').notNull().default('medium'),
			// Private issue: only the creator can see and edit it
			isPrivate: boolean('is_private').notNull().default(false),
			// User who created this issue. Required for isPrivate RLS enforcement.
			ownerUserId: text('owner_user_id').notNull(),
			createdAt: timestamp('created_at').notNull().defaultNow(),
			updatedAt: timestamp('updated_at').notNull().defaultNow()
		},
		(t) => [
			index('issue_project_idx').on(t.projectId),
			index('issue_status_idx').on(t.projectId, t.status),

			// SELECT: private → only creator; shared → owner or any collaborator
			pgPolicy('issue_select', {
				for: 'select',
				using: sql`
				(${t.isPrivate} = true AND ${t.ownerUserId} = ${currentUserId})
				OR
				(${t.isPrivate} = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = ${currentUserId}
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = ${currentUserId}
						)
					)
				))
			`
			}),

			// INSERT: must be a project member and set themselves as owner
			pgPolicy('issue_insert', {
				for: 'insert',
				withCheck: sql`
				${t.ownerUserId} = ${currentUserId}
				AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = ${currentUserId}
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = ${currentUserId}
						)
					)
				)
			`
			}),

			// UPDATE: private → only creator; shared → owner or any collaborator (no writer lock)
			pgPolicy('issue_update', {
				for: 'update',
				using: sql`
				(${t.isPrivate} = true AND ${t.ownerUserId} = ${currentUserId})
				OR
				(${t.isPrivate} = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = ${currentUserId}
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = ${currentUserId}
						)
					)
				))
			`
			}),

			// DELETE: private → creator; shared → project owner only
			pgPolicy('issue_delete', {
				for: 'delete',
				using: sql`
				(${t.isPrivate} = true AND ${t.ownerUserId} = ${currentUserId})
				OR
				(${t.isPrivate} = false AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				))
			`
			})
		]
	)
	.enableRLS();
