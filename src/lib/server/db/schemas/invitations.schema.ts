import { text, timestamp, index, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project, projectRoleEnum } from './projects.schema';

export const invitationStatusEnum = scholioSchema.enum('invitation_status', [
	'pending',
	'accepted',
	'expired',
	'cancelled'
]);

export const projectInvitation = scholioSchema.table(
	'project_invitation',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		invitedEmail: text('invited_email').notNull(),
		invitedBy: text('invited_by').notNull(),
		role: projectRoleEnum('role').notNull(),
		token: text('token').notNull().unique(),
		status: invitationStatusEnum('status').notNull().default('pending'),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('invitation_project_idx').on(t.projectId),

		// SELECT: owner, invitador, o sin contexto de usuario (acceso público por token)
		pgPolicy('invitation_select', {
			for: 'select',
			using: sql`
				current_setting('app.current_user_id', true) = ''
				OR ${t.invitedBy} = current_setting('app.current_user_id', true)
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			`
		}),

		// INSERT/DELETE: solo el owner del proyecto
		pgPolicy('invitation_modify', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			`
		}),

		// UPDATE: owner, o sin contexto de usuario (flujo accept — la app valida el token)
		pgPolicy('invitation_update', {
			for: 'update',
			using: sql`
				current_setting('app.current_user_id', true) = ''
				OR EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = current_setting('app.current_user_id', true)
				)
			`
		})
	]
).enableRLS();
