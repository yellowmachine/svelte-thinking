import { text, timestamp, boolean, pgPolicy, unique } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';

// Reutilizamos el mismo tipo vector(384) que documentChunks
const vector384 = customType<{ data: number[]; driverData: string }>({
	dataType() { return 'vector(384)'; },
	fromDriver(v: string) { return v.slice(1, -1).split(',').map(Number); },
	toDriver(v: number[]) { return `[${v.join(',')}]`; }
});

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
		orcidVerified: boolean('orcid_verified').notNull().default(false),
		// Billing
		stripeCustomerId: text('stripe_customer_id').unique(),
		plan: planEnum('plan').notNull().default('free'),
		planStatus: text('plan_status').default('active'), // active | canceled | past_due
		planCurrentPeriodEnd: timestamp('plan_current_period_end'),
		// Embedding del perfil para búsqueda semántica (null hasta primer indexado)
		profileEmbedding: vector384('profile_embedding'),
		// Per-task AI configuration: { agent, draft, review, requirements } → { keyId, model }
		aiTaskConfig: text('ai_task_config'), // JSON stored as text
		// UI theme preference: 'warm' | 'github' | 'solarized' | 'nord' | 'catppuccin' | 'gruvbox'
		theme: text('theme'),
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
// Múltiples keys por usuario, identificadas por nombre descriptivo
export const userApiKey = scholioSchema.table(
	'user_api_key',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		name: text('name').notNull(), // e.g. "Mi key Anthropic", "Perplexity via OR"
		encryptedApiKey: text('encrypted_api_key').notNull(),
		encryptedDataKey: text('encrypted_data_key').notNull(),
		iv: text('iv').notNull(),
		authTag: text('auth_tag').notNull(),
		enabled: boolean('enabled').notNull().default(true),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		pgPolicy('user_api_key_access', {
			for: 'all',
			using: sql`${t.userId} = ${currentUserId}`
		})
	]
).enableRLS();

// Conexiones a servidores Jupyter remotos (JupyterHub, JupyterLab)
// El token se cifra con el mismo patrón KMS que userAiConfig
export const userJupyterConnection = scholioSchema.table(
	'user_jupyter_connection',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		name: text('name').notNull(), // label visible al usuario, e.g. "JupyterHub UCM"
		baseUrl: text('base_url').notNull(), // e.g. https://jupyter.miinstituto.edu
		encryptedToken: text('encrypted_token').notNull(),
		encryptedDataKey: text('encrypted_data_key').notNull(),
		iv: text('iv').notNull(),
		authTag: text('auth_tag').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		pgPolicy('user_jupyter_connection_access', {
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
		commitEmails: boolean('commit_emails').notNull().default(true),
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

// Configuración S3 del usuario (BYOS3 — Bring Your Own S3)
// Un único registro por usuario. Credenciales cifradas con KMS (mismo patrón que userApiKey).
// encryptedCredentials contiene JSON { accessKey, secretKey }
export const userS3Config = scholioSchema.table(
	'user_s3_config',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull().unique(),
		endpoint: text('endpoint').notNull(),
		bucket: text('bucket').notNull(),
		region: text('region').notNull().default('us-east-1'),
		publicUrl: text('public_url'), // URL pública opcional (CDN, dominio custom)
		encryptedCredentials: text('encrypted_credentials').notNull(),
		encryptedDataKey: text('encrypted_data_key').notNull(),
		iv: text('iv').notNull(),
		authTag: text('auth_tag').notNull(),
		verified: boolean('verified').notNull().default(false),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(t) => [
		pgPolicy('user_s3_config_access', {
			for: 'all',
			using: sql`${t.userId} = ${currentUserId}`
		})
	]
).enableRLS();

export const userSpellAllowlist = scholioSchema.table(
	'user_spell_allowlist',
	{
		userId: text('user_id').notNull(),
		word: text('word').notNull()
	},
	(t) => [
		pgPolicy('user_spell_allowlist_access', {
			for: 'all',
			using: sql`${t.userId} = ${currentUserId}`
		})
	]
).enableRLS();
