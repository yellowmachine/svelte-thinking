import { text, timestamp, index, pgPolicy, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { document } from './documents.schema';
import { project } from './projects.schema';

export const aiMessageRoleEnum = scholioSchema.enum('ai_message_role', ['user', 'assistant']);

export const aiSuggestionTypeEnum = scholioSchema.enum('ai_suggestion_type', [
	'grammar',
	'style',
	'structure',
	'clarity',
	'citation'
]);

export const aiSuggestionStatusEnum = scholioSchema.enum('ai_suggestion_status', [
	'pending',
	'applied',
	'rejected'
]);

export const aiConversation = scholioSchema.table(
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
).enableRLS();

export const aiMessage = scholioSchema.table(
	'ai_message',
	{
		id: text('id').primaryKey(),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => aiConversation.id, { onDelete: 'cascade' }),
		role: aiMessageRoleEnum('role').notNull(),
		content: text('content').notNull(),
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
).enableRLS();

// Daily usage counter per user for operator-hosted AI calls (suggest endpoint).
// Used to enforce rate limits without RLS bypass — each user can only see their own row.
export const userAiUsage = scholioSchema.table(
	'user_ai_usage',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		date: text('date').notNull(), // 'YYYY-MM-DD'
		suggestionCount: integer('suggestion_count').notNull().default(0)
	},
	(t) => [
		uniqueIndex('user_ai_usage_user_date_idx').on(t.userId, t.date),

		pgPolicy('user_ai_usage_access', {
			for: 'all',
			using: sql`${t.userId} = current_setting('app.current_user_id', true)`
		})
	]
).enableRLS();

export const aiSuggestion = scholioSchema.table(
	'ai_suggestion',
	{
		id: text('id').primaryKey(),
		documentId: text('document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		type: aiSuggestionTypeEnum('type').notNull(),
		originalText: text('original_text'),
		suggestedText: text('suggested_text').notNull(),
		explanation: text('explanation'),
		status: aiSuggestionStatusEnum('status').notNull().default('pending'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		index('ai_suggestion_document_idx').on(t.documentId, t.status),

		// Acceso via el documento (RLS en document filtra)
		pgPolicy('ai_suggestion_access', {
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
