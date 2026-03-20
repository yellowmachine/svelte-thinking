import {
	pgTable,
	text,
	timestamp,
	integer,
	boolean,
	pgEnum,
	index,
	uniqueIndex,
	pgPolicy
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { project } from './projects.schema';

export const documentTypeEnum = pgEnum('document_type', [
	'paper',
	'notes',
	'outline',
	'bibliography',
	'supplementary'
]);

export const document = pgTable(
	'document',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		type: documentTypeEnum('type').notNull().default('paper'),
		// FK no forzada para evitar dependencia circular con documentVersion
		currentVersionId: text('current_version_id'),
		// Contenido en progreso (auto-save). null = sin cambios desde el último commit
		draftContent: text('draft_content'),
		// Owner can make a document publicly readable (for AI context sharing)
		isPublic: boolean('is_public').notNull().default(false),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		index('document_project_idx').on(t.projectId),
		uniqueIndex('document_project_title_idx').on(t.projectId, t.title),

		pgPolicy('document_access', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = current_setting('app.current_user_id', true)
						OR EXISTS (
							SELECT 1 FROM project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = current_setting('app.current_user_id', true)
						)
					)
				)
			`
		}),
		// Public documents are readable by anyone (SELECT only)
		pgPolicy('document_public_read', {
			for: 'select',
			using: sql`${t.isPublic} = true`
		})
	]
).enableRLS();

export const documentVersion = pgTable(
	'document_version',
	{
		id: text('id').primaryKey(),
		documentId: text('document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		content: text('content').notNull().default(''),
		versionNumber: integer('version_number').notNull().default(1),
		changeDescription: text('change_description'),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('document_version_document_idx').on(t.documentId, t.versionNumber),

		// Hereda acceso via document (la policy de document ya filtra por proyecto)
		pgPolicy('document_version_access', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM document
					WHERE document.id = ${t.documentId}
				)
			`
		})
	]
).enableRLS();
