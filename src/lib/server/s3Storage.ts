/**
 * Resolvers for decrypted S3 credentials.
 *
 * All DB reads go through withRLS so that app.current_user_id is set
 * and RLS policies are evaluated correctly.
 *
 * - getDecryptedUserS3Config  — user's personal BYOS3
 * - getDecryptedOrgS3Config   — organization BYOS3 (owner or member)
 * - resolveProjectS3Config    — picks the right config for a project:
 *     org project  → org S3  (no fallback — same pattern as AI keys)
 *     user project → user S3
 *
 * Both resolvers are Redis-cached (TTL 10 min). Cache is invalidated on set/remove.
 */

import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { userS3Config, userProfile } from '$lib/server/db/schemas/users.schema';
import { orgS3Config } from '$lib/server/db/schemas/organizations.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { decryptSecret } from '$lib/server/kms';
import { cacheGet, cacheSet, cacheDel, CACHE_KEY, TTL } from '$lib/server/cache';
import { buildInternalS3Config } from '$lib/server/storage';
import type { UserS3Config } from '$lib/server/storage';
import type { Db } from '$lib/server/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WithRLS = (fn: (db: any) => any) => Promise<any>;

// ---------------------------------------------------------------------------
// User S3
// ---------------------------------------------------------------------------

export async function getDecryptedUserS3Config(
	userId: string,
	withRLS: WithRLS
): Promise<UserS3Config | null> {
	const cacheKey = CACHE_KEY.userS3(userId);
	const cached = await cacheGet<UserS3Config>(cacheKey);
	if (cached) return cached;

	const [row] = (await withRLS((db) =>
		db.select().from(userS3Config).where(eq(userS3Config.userId, userId)).limit(1)
	)) as (typeof userS3Config.$inferSelect)[];

	if (!row) return null;

	const plaintext = await decryptSecret({
		encryptedApiKey: row.encryptedCredentials,
		encryptedDataKey: row.encryptedDataKey,
		iv: row.iv,
		authTag: row.authTag
	});
	const { accessKey, secretKey } = JSON.parse(plaintext) as {
		accessKey: string;
		secretKey: string;
	};

	const config: UserS3Config = {
		endpoint: row.endpoint,
		bucket: row.bucket,
		region: row.region,
		accessKey,
		secretKey,
		publicUrl: row.publicUrl
	};

	await cacheSet(cacheKey, config, TTL.s3Config);
	return config;
}

export async function invalidateUserS3Cache(userId: string): Promise<void> {
	await cacheDel(CACHE_KEY.userS3(userId));
}

// ---------------------------------------------------------------------------
// Org S3
// RLS policy allows SELECT for owner or member, WRITE for owner only.
// withRLS must have the requesting user's id set.
// ---------------------------------------------------------------------------

export async function getDecryptedOrgS3Config(
	orgId: string,
	withRLS: WithRLS
): Promise<UserS3Config | null> {
	const cacheKey = CACHE_KEY.orgS3(orgId);
	const cached = await cacheGet<UserS3Config>(cacheKey);
	if (cached) return cached;

	const [row] = (await withRLS((db: Db) =>
		db.select().from(orgS3Config).where(eq(orgS3Config.orgId, orgId)).limit(1)
	)) as (typeof orgS3Config.$inferSelect)[];

	if (!row) return null;

	const plaintext = await decryptSecret({
		encryptedApiKey: row.encryptedCredentials,
		encryptedDataKey: row.encryptedDataKey,
		iv: row.iv,
		authTag: row.authTag
	});
	const { accessKey, secretKey } = JSON.parse(plaintext) as {
		accessKey: string;
		secretKey: string;
	};

	const config: UserS3Config = {
		endpoint: row.endpoint,
		bucket: row.bucket,
		region: row.region,
		accessKey,
		secretKey,
		publicUrl: row.publicUrl
	};

	await cacheSet(cacheKey, config, TTL.s3Config);
	return config;
}

export async function invalidateOrgS3Cache(orgId: string): Promise<void> {
	await cacheDel(CACHE_KEY.orgS3(orgId));
}

// ---------------------------------------------------------------------------
// Project resolver — org S3 or user S3, no fallback
// ---------------------------------------------------------------------------

/**
 * Resolves which S3 config to use for a given project.
 *
 * - If the project belongs to an org → org S3 config (required, no fallback).
 *   Throws PRECONDITION_FAILED if the org has no S3 configured.
 * - Otherwise → user S3 config.
 *   Returns null if the user has no S3 configured (caller decides the error).
 *
 * Authorization is fully RLS-driven: withRLS must carry the requesting user's id.
 * The project SELECT confirms project access; the orgS3Config SELECT confirms
 * org membership (owner or member).
 */
export async function resolveProjectS3Config(
	projectId: string,
	userId: string,
	withRLS: WithRLS
): Promise<UserS3Config | null> {
	// 1. Confirm project access and get orgId — RLS enforces project authorization
	const [proj] = (await withRLS((db: Db) =>
		db
			.select({ orgId: project.orgId })
			.from(project)
			.where(eq(project.id, projectId))
			.limit(1)
	)) as { orgId: string | null }[];

	const orgId = proj?.orgId ?? null;

	if (orgId) {
		// 2. Org project — resolve org S3 (RLS: owner or member)
		const config = await getDecryptedOrgS3Config(orgId, withRLS);
		if (!config) {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message:
					'This project belongs to an organization with no S3 storage configured. Configure it in Organization Settings → Storage.'
			});
		}
		return config;
	}

	// 3. Personal project → check internal storage flag first, then BYOS3
	const [profileRow] = (await withRLS((db: Db) =>
		db
			.select({ useInternalStorage: userProfile.useInternalStorage })
			.from(userProfile)
			.where(eq(userProfile.userId, userId))
			.limit(1)
	)) as { useInternalStorage: boolean }[];

	if (profileRow?.useInternalStorage) {
		return buildInternalS3Config(userId);
	}

	return getDecryptedUserS3Config(userId, withRLS);
}
