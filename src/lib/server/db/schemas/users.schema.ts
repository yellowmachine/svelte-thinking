import { pgTable, text, timestamp, pgPolicy, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const planEnum = pgEnum('plan', ['free', 'pro', 'team']);

const currentUserId = sql`current_setting('app.current_user_id', true)`;

export const userProfile = pgTable(
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

// API keys del usuario encriptadas con AES-256-GCM
export const userAiConfig = pgTable(
	'user_ai_config',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull().unique(),
		provider: text('provider').notNull(), // 'openai' | 'anthropic'
		encryptedApiKey: text('encrypted_api_key').notNull(),
		salt: text('salt').notNull(),
		iv: text('iv').notNull(),
		authTag: text('auth_tag').notNull(),
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
