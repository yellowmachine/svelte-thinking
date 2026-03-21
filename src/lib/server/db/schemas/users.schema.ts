import { text, timestamp, boolean, pgPolicy, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';

export const planEnum = scholioSchema.enum('plan', ['free', 'pro', 'team']);

// nullif converts '' to NULL so both missing and empty-string are treated as unauthenticated
const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

export const userProfile = scholioSchema.table(
	'user_profile',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull().unique(),
		displayName: text('display_name'),
		bio: text('bio'),
		institution: text('institution'),
		orcid: text('orcid'),
		// Billing
		stripeCustomerId: text('stripe_customer_id').unique(),
		plan: planEnum('plan').notNull().default('free'),
		planStatus: text('plan_status').default('active'), // active | canceled | past_due
		planCurrentPeriodEnd: timestamp('plan_current_period_end'),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		// SELECT: propio perfil o cualquier usuario autenticado (perfiles son públicos entre usuarios)
		pgPolicy('user_profile_select', {
			for: 'select',
			using: sql`${currentUserId} IS NOT NULL`
		}),

		// INSERT/UPDATE/DELETE: solo el propio usuario
		pgPolicy('user_profile_modify', {
			for: 'all',
			using: sql`${t.userId} = ${currentUserId}`
		})
	]
).enableRLS();

// API keys del usuario cifradas con AWS KMS (envelope encryption)
export const userAiConfig = scholioSchema.table(
	'user_ai_config',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull().unique(),
		provider: text('provider').notNull().default('openrouter'),
		encryptedApiKey: text('encrypted_api_key').notNull(),
		encryptedDataKey: text('encrypted_data_key').notNull(), // data key cifrada por KMS
		iv: text('iv').notNull(),
		authTag: text('auth_tag').notNull(),
		enabled: boolean('enabled').notNull().default(true),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		// Solo el propio usuario puede ver/modificar su config de IA
		pgPolicy('user_ai_config_access', {
			for: 'all',
			using: sql`${t.userId} = ${currentUserId}`
		})
	]
).enableRLS();

export const notificationPreference = scholioSchema.table(
	'notification_preference',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		projectId: text('project_id').notNull(),
		commentEmails: boolean('comment_emails').notNull().default(true),
		unsubscribeToken: text('unsubscribe_token').notNull().unique(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		unique().on(t.userId, t.projectId),
		pgPolicy('notification_preference_access', {
			for: 'all',
			using: sql`${t.userId} = ${currentUserId}`
		})
	]
).enableRLS();
