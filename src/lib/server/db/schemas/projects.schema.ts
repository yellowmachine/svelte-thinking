import {
	pgTable,
	text,
	timestamp,
	pgEnum,
	index,
	uniqueIndex,
	pgPolicy
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const projectStatusEnum = pgEnum('project_status', [
	'draft',
	'active',
	'review',
	'published',
	'archived'
]);

export const projectRoleEnum = pgEnum('project_role', [
	'owner',
	'author',
	'coauthor',
	'reviewer',
	'commenter'
]);

const currentUserId = sql`current_setting('app.current_user_id', true)`;

export const project = pgTable(
	'project',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		description: text('description'),
		status: projectStatusEnum('status').notNull().default('draft'),
		ownerId: text('owner_id').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		index('project_owner_idx').on(t.ownerId),

		// SELECT: owner directo o colaborador del proyecto
		pgPolicy('project_select', {
			for: 'select',
			using: sql`
				${t.ownerId} = ${currentUserId}
				OR EXISTS (
					SELECT 1 FROM project_collaborator
					WHERE project_collaborator.project_id = ${t.id}
					AND project_collaborator.user_id = ${currentUserId}
				)
			`
		}),

		// INSERT: solo puede insertar proyectos donde sea el owner
		pgPolicy('project_insert', {
			for: 'insert',
			withCheck: sql`${t.ownerId} = ${currentUserId}`
		}),

		// UPDATE/DELETE: solo el owner
		pgPolicy('project_update', {
			for: 'update',
			using: sql`${t.ownerId} = ${currentUserId}`
		}),
		pgPolicy('project_delete', {
			for: 'delete',
			using: sql`${t.ownerId} = ${currentUserId}`
		})
	]
).enableRLS();

export const projectCollaborator = pgTable(
	'project_collaborator',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		userId: text('user_id').notNull(),
		role: projectRoleEnum('role').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('project_collaborator_unique_idx').on(t.projectId, t.userId),
		index('project_collaborator_project_idx').on(t.projectId),
		index('project_collaborator_user_idx').on(t.userId),

		// SELECT: el propio colaborador o el owner del proyecto puede ver la lista
		pgPolicy('collaborator_select', {
			for: 'select',
			using: sql`
				${t.userId} = ${currentUserId}
				OR EXISTS (
					SELECT 1 FROM project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),

		// INSERT/UPDATE/DELETE: solo el owner del proyecto
		pgPolicy('collaborator_modify', {
			for: 'all',
			using: sql`
				EXISTS (
					SELECT 1 FROM project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),

		// INSERT extra: sin contexto de usuario (flujo accept — la app valida el token de invitación)
		pgPolicy('collaborator_insert_invite', {
			for: 'insert',
			withCheck: sql`current_setting('app.current_user_id', true) = ''`
		})
	]
).enableRLS();
