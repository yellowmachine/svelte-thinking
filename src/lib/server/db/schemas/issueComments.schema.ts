import { text, timestamp, index, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { issue } from './issues.schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

export const issueComment = scholioSchema
	.table(
		'issue_comment',
		{
			id: text('id').primaryKey(),
			issueId: text('issue_id')
				.notNull()
				.references(() => issue.id, { onDelete: 'cascade' }),
			// Denormalized for RLS — avoids a join to issue just to get projectId
			projectId: text('project_id').notNull(),
			authorId: text('author_id').notNull(),
			content: text('content').notNull(),
			parentCommentId: text('parent_comment_id'),
			createdAt: timestamp('created_at').notNull().defaultNow(),
			updatedAt: timestamp('updated_at').notNull().defaultNow()
		},
		(t) => [
			index('issue_comment_issue_idx').on(t.issueId),

			// SELECT: any project member
			pgPolicy('issue_comment_select', {
				for: 'select',
				using: sql`
				EXISTS (
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

			// INSERT: project member + must set themselves as author
			pgPolicy('issue_comment_insert', {
				for: 'insert',
				withCheck: sql`
				${t.authorId} = ${currentUserId}
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

			// UPDATE: author only
			pgPolicy('issue_comment_update', {
				for: 'update',
				using: sql`${t.authorId} = ${currentUserId}`
			}),

			// DELETE: author only
			pgPolicy('issue_comment_delete', {
				for: 'delete',
				using: sql`${t.authorId} = ${currentUserId}`
			})
		]
	)
	.enableRLS();
