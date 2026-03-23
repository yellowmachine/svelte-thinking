import { text, timestamp, index, uniqueIndex, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

// Un usuario expresa interés en el owner de un proyecto buscable.
// El owner puede ver quién está interesado y visitar su perfil.
export const projectInterest = scholioSchema.table(
	'project_interest',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		userId: text('user_id').notNull(), // usuario interesado
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('project_interest_unique_idx').on(t.projectId, t.userId),
		index('project_interest_project_idx').on(t.projectId),
		index('project_interest_user_idx').on(t.userId),

		// SELECT: el propio usuario interesado O el owner del proyecto
		pgPolicy('project_interest_select', {
			for: 'select',
			using: sql`
				${t.userId} = ${currentUserId}
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),

		// INSERT: usuario autenticado que no sea el owner del proyecto
		pgPolicy('project_interest_insert', {
			for: 'insert',
			withCheck: sql`
				${t.userId} = ${currentUserId}
				AND NOT EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),

		// DELETE: solo el propio usuario (desfijar)
		pgPolicy('project_interest_delete', {
			for: 'delete',
			using: sql`${t.userId} = ${currentUserId}`
		})
	]
).enableRLS();
