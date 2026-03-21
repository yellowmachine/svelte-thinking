import { text, timestamp, jsonb, index, uniqueIndex, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';

export const referenceTypeEnum = scholioSchema.enum('reference_type', [
	'article',
	'book',
	'inproceedings',
	'incollection',
	'phdthesis',
	'mastersthesis',
	'techreport',
	'misc'
]);

// RLS helper — reused from other schemas
const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

// project_reference: one row per bibliographic entry.
// Authors are stored as [{first, last}] JSON array to avoid re-parsing.
// Type-specific fields use nullable columns for the most common ones;
// anything unusual goes in `extra` JSONB.
export const projectReference = scholioSchema.table(
	'project_reference',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),

		// The BibTeX cite key, unique within a project (e.g. "smith2023")
		citeKey: text('cite_key').notNull(),

		type: referenceTypeEnum('type').notNull().default('article'),

		// Core fields — required for every entry type
		title: text('title').notNull(),
		authors: jsonb('authors').notNull().default([]), // {first: string, last: string}[]

		year: text('year'),
		abstract: text('abstract'),
		doi: text('doi'),
		url: text('url'),
		note: text('note'),

		// Personal reading notes (markdown, not exported to BibTeX)
		readingNotes: text('reading_notes'),

		// Article / journal fields
		journal: text('journal'),
		volume: text('volume'),
		issue: text('issue'),
		pages: text('pages'),

		// Book / collection fields
		publisher: text('publisher'),
		edition: text('edition'),
		address: text('address'),
		isbn: text('isbn'),
		editors: jsonb('editors').default([]), // {first: string, last: string}[]

		// Conference / collection
		booktitle: text('booktitle'),
		organization: text('organization'),
		series: text('series'),

		// Thesis
		school: text('school'),

		// Technical report
		institution: text('institution'),
		reportNumber: text('report_number'),

		// Misc / catch-all for non-standard fields
		extra: jsonb('extra').default({}),

		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('ref_project_key_idx').on(t.projectId, t.citeKey),
		index('ref_project_idx').on(t.projectId),

		// Access: owner or any collaborator of the project
		pgPolicy('reference_access', {
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
