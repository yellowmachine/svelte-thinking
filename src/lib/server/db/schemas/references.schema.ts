import { text, timestamp, jsonb, index, uniqueIndex, pgPolicy, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';
import { document } from './documents.schema';

export const referenceTypeEnum = scholioSchema.enum('reference_type', [
	'article',
	'book',
	'inproceedings',
	'incollection',
	'phdthesis',
	'mastersthesis',
	'techreport',
	'misc',
	'magisterial',
	'patristic',
	'scholastic',
	'biblical',
	'classical',
	'earlymodern'
]);

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

// reference: one row per bibliographic entry, owned by a user (not a project).
// Authors are stored as [{first, last}] JSON array to avoid re-parsing.
// Type-specific fields use nullable columns for the most common ones;
// anything unusual goes in `extra` JSONB.
export const reference = scholioSchema.table(
	'reference',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),

		// The BibTeX cite key, unique per user (e.g. "smith2023")
		citeKey: text('cite_key').notNull(),

		type: referenceTypeEnum('type').notNull().default('article'),

		title: text('title').notNull(),
		authors: jsonb('authors').notNull().default([]), // {first: string, last: string}[]

		year: text('year'),
		abstract: text('abstract'),
		doi: text('doi'),
		url: text('url'),
		note: text('note'),

		// FK to a reading_note document — created on demand from /bib.
		readingNotesDocId: text('reading_notes_doc_id')
			.references(() => document.id, { onDelete: 'set null' }),

		// PDF attachment stored in S3 (optional)
		pdfKey: text('pdf_key'),
		pdfUrl: text('pdf_url'),

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

		extra: jsonb('extra').default({}),

		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('ref_user_key_idx').on(t.userId, t.citeKey),
		index('ref_user_idx').on(t.userId),

		// Owner can always access. Collaborators on any linked project can also access.
		pgPolicy('reference_access', {
			for: 'all',
			using: sql`
				${t.userId} = ${currentUserId}
				OR EXISTS (
					SELECT 1 FROM scholio.project_reference pr
					INNER JOIN scholio.project p ON p.id = pr.project_id
					WHERE pr.reference_id = ${t.id}
					AND (
						p.owner_id = ${currentUserId}
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = p.id
							AND project_collaborator.user_id = ${currentUserId}
						)
					)
				)
			`
		})
	]
).enableRLS();

// project_reference: pivot linking references to projects (many-to-many).
export const projectReference = scholioSchema.table(
	'project_reference',
	{
		referenceId: text('reference_id')
			.notNull()
			.references(() => reference.id, { onDelete: 'cascade' }),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.referenceId, t.projectId] }),
		index('proj_ref_project_idx').on(t.projectId),

		// Access: owner or collaborator of the project
		pgPolicy('project_reference_access', {
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
