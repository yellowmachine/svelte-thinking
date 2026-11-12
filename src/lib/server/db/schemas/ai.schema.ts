import {
	text,
	timestamp,
	index,
	pgPolicy,
	integer,
	jsonb,
	numeric,
	boolean
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;
import { project } from './projects.schema';

export const aiMessageRoleEnum = scholioSchema.enum('ai_message_role', ['user', 'assistant']);

export const aiConversation = scholioSchema
	.table(
		'ai_conversation',
		{
			id: text('id').primaryKey(),
			projectId: text('project_id')
				.notNull()
				.references(() => project.id, { onDelete: 'cascade' }),
			userId: text('user_id').notNull(),
			title: text('title'),
			createdAt: timestamp('created_at').notNull().defaultNow(),
			updatedAt: timestamp('updated_at').notNull().defaultNow()
		},
		(t) => [
			index('ai_conversation_project_idx').on(t.projectId, t.userId),

			// Solo el usuario dueño de la conversación puede accederla
			pgPolicy('ai_conversation_access', {
				for: 'all',
				using: sql`${t.userId} = current_setting('app.current_user_id', true)`
			})
		]
	)
	.enableRLS();

export const aiMessage = scholioSchema
	.table(
		'ai_message',
		{
			id: text('id').primaryKey(),
			conversationId: text('conversation_id')
				.notNull()
				.references(() => aiConversation.id, { onDelete: 'cascade' }),
			role: aiMessageRoleEnum('role').notNull(),
			content: text('content').notNull(),
			docsUsed: jsonb('docs_used').$type<{ id: string; title: string }[]>().notNull().default([]),
			createdAt: timestamp('created_at').notNull().defaultNow()
		},
		(t) => [
			index('ai_message_conversation_idx').on(t.conversationId),

			// Hereda acceso via la conversación (RLS en aiConversation filtra el JOIN)
			pgPolicy('ai_message_access', {
				for: 'all',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.ai_conversation
					WHERE ai_conversation.id = ${t.conversationId}
				)
			`
			})
		]
	)
	.enableRLS();

// Immutable log of AI calls — aggregated for quota enforcement and billing visibility.
// orgId = null means personal (user key); orgId set means org billing applies.
export const aiUsageLog = scholioSchema
	.table(
		'ai_usage_log',
		{
			id: text('id').primaryKey(),
			orgId: text('org_id'), // null = personal
			projectId: text('project_id').notNull(),
			userId: text('user_id').notNull(),
			model: text('model').notNull(),
			task: text('task'), // AiTask, or 'spell' / 'grammar' from inside the editor agent
			inputTokens: integer('input_tokens').notNull().default(0),
			outputTokens: integer('output_tokens').notNull().default(0),
			// USD: what OpenRouter charged (usage.cost), or tokens × list price when the response
			// had no charge (cost_is_estimate). Null only for an unknown model with no charge.
			costUsd: numeric('cost_usd', { precision: 12, scale: 8 }),
			costIsEstimate: boolean('cost_is_estimate').notNull().default(false),
			createdAt: timestamp('created_at').notNull().defaultNow()
		},
		(t) => [
			index('ai_usage_log_org_idx').on(t.orgId, t.createdAt),
			index('ai_usage_log_project_idx').on(t.projectId, t.createdAt),
			index('ai_usage_log_user_idx').on(t.userId, t.createdAt),

			// User sees own rows; org owner sees all org rows
			pgPolicy('ai_usage_log_select', {
				for: 'select',
				using: sql`
				${t.userId} = ${currentUserId}
				OR (
					${t.orgId} IS NOT NULL
					AND EXISTS (
						SELECT 1 FROM scholio.organization
						WHERE organization.id = ${t.orgId}
						AND organization.owner_id = ${currentUserId}
					)
				)
			`
			}),

			// Server inserts with user context set
			pgPolicy('ai_usage_log_insert', {
				for: 'insert',
				withCheck: sql`${t.userId} = ${currentUserId}`
			})
		]
	)
	.enableRLS();
