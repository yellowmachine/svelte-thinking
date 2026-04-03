import { text, timestamp, index, uniqueIndex, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';
import { document } from './documents.schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

// project_context_link: documents from other projects that the AI can use as context
// when generating drafts or answering questions in this project.
export const projectContextLink = scholioSchema.table(
	'project_context_link',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		linkedDocumentId: text('linked_document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('ctx_link_unique_idx').on(t.projectId, t.linkedDocumentId),
		index('ctx_link_project_idx').on(t.projectId),

		// Access: owner or collaborator of the project that owns the link
		pgPolicy('context_link_access', {
			for: 'all',
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
		})
	]
).enableRLS();
