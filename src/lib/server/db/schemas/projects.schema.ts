import { text, timestamp, index, uniqueIndex, pgPolicy, boolean, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';

export const projectStatusEnum = scholioSchema.enum('project_status', [
	'draft',
	'active',
	'review',
	'published',
	'archived'
]);

export const projectRoleEnum = scholioSchema.enum('project_role', [
	'owner',
	'author',
	'coauthor',
	'reviewer',
	'commenter'
]);

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

export const project = scholioSchema.table(
	'project',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		description: text('description'),
		status: projectStatusEnum('status').notNull().default('draft'),
		ownerId: text('owner_id').notNull(),
		isSearchable: boolean('is_searchable').notNull().default(false),
		requirementsPrompt: text('requirements_prompt'),
		requirementsTemplate: text('requirements_template'),
		// Optional org link — when set, AI key is resolved from the org (not the user)
		orgId: text('org_id'),
		// Per-project spend cap in EUR (null = inherits org limit)
		projectBudgetEur: numeric('project_budget_eur', { precision: 10, scale: 2 }),
		doi: text('doi'),
		version: text('version'),
		publishedAt: timestamp('published_at'),
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
					SELECT 1 FROM scholio.project_collaborator
					WHERE project_collaborator.project_id = ${t.id}
					AND project_collaborator.user_id = ${currentUserId}
				)
			`
		}),

		// SELECT: proyecto buscable — cualquier usuario autenticado puede ver
		pgPolicy('project_select_searchable', {
			for: 'select',
			using: sql`${t.isSearchable} = true AND ${currentUserId} IS NOT NULL`
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

export const projectCollaborator = scholioSchema.table(
	'project_collaborator',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		userId: text('user_id').notNull(),
		ownerUserId: text('owner_user_id').notNull(),
		role: projectRoleEnum('role').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('project_collaborator_unique_idx').on(t.projectId, t.userId),
		index('project_collaborator_project_idx').on(t.projectId),
		index('project_collaborator_user_idx').on(t.userId),

		pgPolicy('collaborator_select', {
			for: 'select',
			using: sql`${t.userId} = ${currentUserId}`
		}),

		// Owner puede ver todos los colaboradores de sus proyectos
		// (columna directa para evitar recursión circular con project_select → project_collaborator)
		pgPolicy('collaborator_select_owner', {
			for: 'select',
			using: sql`${t.ownerUserId} = ${currentUserId}`
		}),

		pgPolicy('collaborator_insert', {
			for: 'insert',
			withCheck: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),
		pgPolicy('collaborator_update', {
			for: 'update',
			using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),
		pgPolicy('collaborator_delete', {
			for: 'delete',
			using: sql`
				${t.role} != 'owner'
				AND EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND project.owner_id = ${currentUserId}
				)
			`
		}),

		// Colaborador puede abandonar su propio vínculo (leave project)
		pgPolicy('collaborator_self_delete', {
			for: 'delete',
			using: sql`${t.userId} = ${currentUserId}`
		}),

		// INSERT extra: sin contexto de usuario (flujo accept — la app valida el token de invitación)
		pgPolicy('collaborator_insert_invite', {
			for: 'insert',
			withCheck: sql`current_setting('app.current_user_id', true) = ''`
		})
	]
).enableRLS();
