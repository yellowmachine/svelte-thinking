import { text, timestamp, integer, index, pgPolicy } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { document } from './documents.schema';

// pgvector custom type — stores float[] as a native vector column
const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
	dataType(config) {
		return `vector(${config?.dimensions ?? 384})`;
	},
	fromDriver(value: string) {
		// pgvector returns "[0.1,0.2,...]"
		return value
			.slice(1, -1)
			.split(',')
			.map(Number);
	},
	toDriver(value: number[]) {
		return `[${value.join(',')}]`;
	}
});

export const documentChunk = scholioSchema.table(
	'document_chunk',
	{
		id: text('id').primaryKey(),
		documentId: text('document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		// Denormalized for faster similarity search filtering without join
		projectId: text('project_id').notNull(),
		chunkIndex: integer('chunk_index').notNull(),
		text: text('text').notNull(),
		embedding: vector('embedding', { dimensions: 384 }).notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('document_chunk_document_idx').on(t.documentId),
		index('document_chunk_project_idx').on(t.projectId),

		// Hereda acceso via document (RLS en document filtra por proyecto)
		pgPolicy('document_chunk_access', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM scholio.document
					WHERE document.id = ${t.documentId}
				)
			`
		})
	]
).enableRLS();
