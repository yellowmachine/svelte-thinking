import { text, timestamp, boolean, uniqueIndex, index, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

// ── Enums ─────────────────────────────────────────────────────────────────

export const orgMemberRoleEnum = scholioSchema.enum('org_member_role', [
	'admin',
	'member',
	'guest'
]);

export const orgInvitationStatusEnum = scholioSchema.enum('org_invitation_status', [
	'pending',
	'accepted',
	'rejected',
	'expired'
]);

// ── organization ──────────────────────────────────────────────────────────

export const organization = scholioSchema
	.table(
		'organization',
		{
			id: text('id').primaryKey(),
			name: text('name').notNull(),
			slug: text('slug').notNull().unique(),
			ownerId: text('owner_id').notNull(),
			// Per-task AI config: { agent, draft, review, requirements } → { keyId, model }
			// keyId references organization_api_key.id
			aiTaskConfig: text('ai_task_config'),
			createdAt: timestamp('created_at').notNull().defaultNow(),
			updatedAt: timestamp('updated_at').notNull().defaultNow()
		},
		(t) => [
			index('org_owner_idx').on(t.ownerId),

			// SELECT: owner or any member
			pgPolicy('org_select', {
				for: 'select',
				using: sql`
				${t.ownerId} = ${currentUserId}
				OR EXISTS (
					SELECT 1 FROM scholio.organization_member
					WHERE organization_member.org_id = ${t.id}
					AND organization_member.user_id = ${currentUserId}
				)
			`
			}),

			// INSERT: any authenticated user can create an org (becomes owner)
			pgPolicy('org_insert', {
				for: 'insert',
				withCheck: sql`${t.ownerId} = ${currentUserId}`
			}),

			// UPDATE/DELETE: owner only
			pgPolicy('org_update', {
				for: 'update',
				using: sql`${t.ownerId} = ${currentUserId}`
			}),
			pgPolicy('org_delete', {
				for: 'delete',
				using: sql`${t.ownerId} = ${currentUserId}`
			})
		]
	)
	.enableRLS();

// ── organization_member ───────────────────────────────────────────────────
// orgOwnerId is denormalized from organization.ownerId — avoids circular
// RLS (same pattern as projectCollaborator.ownerUserId).

export const organizationMember = scholioSchema
	.table(
		'organization_member',
		{
			id: text('id').primaryKey(),
			orgId: text('org_id')
				.notNull()
				.references(() => organization.id, { onDelete: 'cascade' }),
			userId: text('user_id').notNull(),
			orgOwnerId: text('org_owner_id').notNull(), // denormalized — no circular RLS
			role: orgMemberRoleEnum('role').notNull().default('member'),
			createdAt: timestamp('created_at').notNull().defaultNow()
		},
		(t) => [
			uniqueIndex('org_member_unique_idx').on(t.orgId, t.userId),
			index('org_member_org_idx').on(t.orgId),
			index('org_member_user_idx').on(t.userId),

			// SELECT: own membership row
			pgPolicy('org_member_select', {
				for: 'select',
				using: sql`${t.userId} = ${currentUserId}`
			}),
			// SELECT: org owner sees all members (no circular dep — direct column)
			pgPolicy('org_member_select_owner', {
				for: 'select',
				using: sql`${t.orgOwnerId} = ${currentUserId}`
			}),

			// INSERT: org owner adds members
			pgPolicy('org_member_insert', {
				for: 'insert',
				withCheck: sql`${t.orgOwnerId} = ${currentUserId}`
			}),
			// INSERT: no-context bypass for invitation acceptance (app validates token)
			pgPolicy('org_member_insert_invite', {
				for: 'insert',
				withCheck: sql`current_setting('app.current_user_id', true) = ''`
			}),

			// DELETE: org owner removes members, or member leaves themselves
			pgPolicy('org_member_delete', {
				for: 'delete',
				using: sql`${t.orgOwnerId} = ${currentUserId} OR ${t.userId} = ${currentUserId}`
			})
		]
	)
	.enableRLS();

// ── organization_api_key ──────────────────────────────────────────────────
// Same KMS envelope encryption pattern as userApiKey.
// Only org owner/admins access this — key material never leaves the server.

export const organizationApiKey = scholioSchema
	.table(
		'organization_api_key',
		{
			id: text('id').primaryKey(),
			orgId: text('org_id')
				.notNull()
				.references(() => organization.id, { onDelete: 'cascade' }),
			name: text('name').notNull(),
			encryptedApiKey: text('encrypted_api_key').notNull(),
			encryptedDataKey: text('encrypted_data_key').notNull(),
			iv: text('iv').notNull(),
			authTag: text('auth_tag').notNull(),
			enabled: boolean('enabled').notNull().default(true),
			createdAt: timestamp('created_at').notNull().defaultNow(),
			updatedAt: timestamp('updated_at').notNull().defaultNow()
		},
		(t) => [
			index('org_api_key_org_idx').on(t.orgId),

			// ALL: org owner only (sensitive key material)
			pgPolicy('org_api_key_access', {
				for: 'all',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = ${t.orgId}
					AND organization.owner_id = ${currentUserId}
				)
			`
			})
		]
	)
	.enableRLS();

// ── org_invitation ────────────────────────────────────────────────────────

export const orgInvitation = scholioSchema
	.table(
		'org_invitation',
		{
			id: text('id').primaryKey(),
			orgId: text('org_id')
				.notNull()
				.references(() => organization.id, { onDelete: 'cascade' }),
			orgName: text('org_name'), // denormalized for email display
			invitedEmail: text('invited_email').notNull(),
			invitedBy: text('invited_by').notNull(),
			token: text('token').notNull().unique(),
			status: orgInvitationStatusEnum('status').notNull().default('pending'),
			expiresAt: timestamp('expires_at').notNull(),
			createdAt: timestamp('created_at').notNull().defaultNow()
		},
		(t) => [
			uniqueIndex('org_invitation_unique_idx').on(t.orgId, t.invitedEmail),
			index('org_invitation_org_idx').on(t.orgId),
			index('org_invitation_token_idx').on(t.token),

			// SELECT: no-context (token flow), inviter, or org owner
			pgPolicy('org_invitation_select', {
				for: 'select',
				using: sql`
				current_setting('app.current_user_id', true) = ''
				OR ${t.invitedBy} = ${currentUserId}
				OR EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = ${t.orgId}
					AND organization.owner_id = ${currentUserId}
				)
			`
			}),

			// INSERT: org owner
			pgPolicy('org_invitation_insert', {
				for: 'insert',
				withCheck: sql`
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = ${t.orgId}
					AND organization.owner_id = ${currentUserId}
				)
			`
			}),

			// UPDATE (accept/reject): no-context token flow (app validates token)
			pgPolicy('org_invitation_update', {
				for: 'update',
				using: sql`current_setting('app.current_user_id', true) = ''`
			}),

			// DELETE: org owner cancels invitation
			pgPolicy('org_invitation_delete', {
				for: 'delete',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = ${t.orgId}
					AND organization.owner_id = ${currentUserId}
				)
			`
			})
		]
	)
	.enableRLS();

// ── org_s3_config ─────────────────────────────────────────────────────────
// BYOS3 for organizations — same KMS envelope encryption pattern as userS3Config.
// encryptedCredentials contains JSON { accessKey, secretKey }.
// Access restricted to org owner only (same as organization_api_key).

export const orgS3Config = scholioSchema
	.table(
		'org_s3_config',
		{
			id: text('id').primaryKey(),
			orgId: text('org_id')
				.notNull()
				.unique()
				.references(() => organization.id, { onDelete: 'cascade' }),
			endpoint: text('endpoint').notNull(),
			bucket: text('bucket').notNull(),
			region: text('region').notNull().default('us-east-1'),
			publicUrl: text('public_url'),
			encryptedCredentials: text('encrypted_credentials').notNull(),
			encryptedDataKey: text('encrypted_data_key').notNull(),
			iv: text('iv').notNull(),
			authTag: text('auth_tag').notNull(),
			verified: boolean('verified').notNull().default(false),
			createdAt: timestamp('created_at').notNull().defaultNow(),
			updatedAt: timestamp('updated_at').notNull().defaultNow()
		},
		(t) => [
			index('org_s3_config_org_idx').on(t.orgId),

			// SELECT: org owner or any org member (members need to resolve credentials for uploads)
			pgPolicy('org_s3_config_read', {
				for: 'select',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = ${t.orgId}
					AND organization.owner_id = ${currentUserId}
				)
				OR EXISTS (
					SELECT 1 FROM scholio.organization_member
					WHERE organization_member.org_id = ${t.orgId}
					AND organization_member.user_id = ${currentUserId}
				)
			`
			}),

			// INSERT/UPDATE/DELETE: org owner only
			pgPolicy('org_s3_config_write', {
				for: 'all',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.organization
					WHERE organization.id = ${t.orgId}
					AND organization.owner_id = ${currentUserId}
				)
			`
			})
		]
	)
	.enableRLS();
