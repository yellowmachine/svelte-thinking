import { pgTable, text, timestamp, index, uniqueIndex, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { document } from './documents.schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

// document_link: index of [[wikilinks]] between documents, updated on commit.
// source → target. One row per unique (source, target) pair.
export const documentLink = pgTable(
	'document_link',
	{
		id: text('id').primaryKey(),
		sourceDocumentId: text('source_document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		targetDocumentId: text('target_document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('doc_link_unique_idx').on(t.sourceDocumentId, t.targetDocumentId),
		index('doc_link_source_idx').on(t.sourceDocumentId),
		index('doc_link_target_idx').on(t.targetDocumentId),

		// Access: readable if you have access to the source document's project
		pgPolicy('document_link_access', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM document
					JOIN project ON project.id = document.project_id
					WHERE document.id = ${t.sourceDocumentId}
					AND (
						project.owner_id = ${currentUserId}
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = ${currentUserId}
						)
					)
				)
			`
		}),
		// Also readable when the TARGET is mine and the SOURCE is public
		// (so I can see who links to my documents from public documents)
		pgPolicy('document_link_incoming_public', {
			for: 'select',
			using: sql`
				EXISTS (
					SELECT 1 FROM document source_doc
					WHERE source_doc.id = ${t.sourceDocumentId}
					AND source_doc.is_public = true
				)
				AND EXISTS (
					SELECT 1 FROM document target_doc
					JOIN project ON project.id = target_doc.project_id
					WHERE target_doc.id = ${t.targetDocumentId}
					AND (
						project.owner_id = ${currentUserId}
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = ${currentUserId}
						)
					)
				)
			`
		})
	]
).enableRLS();
