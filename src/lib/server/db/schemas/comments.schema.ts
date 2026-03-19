import { pgTable, text, timestamp, integer, pgEnum, index, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { document } from './documents.schema';

export const commentTypeEnum = pgEnum('comment_type', ['general', 'inline']);

export const commentStatusEnum = pgEnum('comment_status', ['open', 'resolved']);

export const comment = pgTable(
	'comment',
	{
		id: text('id').primaryKey(),
		documentId: text('document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		authorId: text('author_id').notNull(),
		type: commentTypeEnum('type').notNull().default('general'),
		content: text('content').notNull(),
		// Solo para comentarios inline
		anchorText: text('anchor_text'),
		lineStart: integer('line_start'),
		lineEnd: integer('line_end'),
		characterStart: integer('character_start'),
		characterEnd: integer('character_end'),
		status: commentStatusEnum('status').notNull().default('open'),
		// Para respuestas anidadas
		parentCommentId: text('parent_comment_id'),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		index('comment_document_status_idx').on(t.documentId, t.status),

		// SELECT: cualquiera con acceso al documento puede ver comentarios
		pgPolicy('comment_select', {
			for: 'select',
			using: sql`
				EXISTS (SELECT 1 FROM document WHERE document.id = ${t.documentId})
			`
		}),

		// INSERT: cualquiera con acceso puede comentar
		pgPolicy('comment_insert', {
			for: 'insert',
			withCheck: sql`
				${t.authorId} = current_setting('app.current_user_id', true)
				AND EXISTS (SELECT 1 FROM document WHERE document.id = ${t.documentId})
			`
		}),

		// UPDATE/DELETE: solo el autor del comentario
		pgPolicy('comment_modify', {
			for: 'update',
			using: sql`${t.authorId} = current_setting('app.current_user_id', true)`
		}),
		pgPolicy('comment_delete', {
			for: 'delete',
			using: sql`${t.authorId} = current_setting('app.current_user_id', true)`
		})
	]
).enableRLS();
