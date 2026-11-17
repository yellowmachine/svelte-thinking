/**
 * DELETE /api/account/delete
 *
 * Permanently deletes the authenticated user's account and all associated data:
 *   1. Scholio data, inside one RLS transaction as the user (deleteAccountData).
 *      Before deleting, the same transaction lists the files to remove and reads
 *      the credentials of each bucket they live in: afterwards the user's S3
 *      config, the organizations they owned and their memberships are gone.
 *   2. Better Auth records (session, account, user) — deleting the user row
 *      cascades to session and account via Better Auth's FK.
 *   3. Files, best-effort, each in its own bucket, once the data is gone.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, type Db } from '$lib/server/db';
import { user as authUser } from '$lib/server/db/auth.schema';
import { deleteFileWithConfig, type UserS3Config } from '$lib/server/storage';
import { getDecryptedUserS3Config, getDecryptedOrgS3Config } from '$lib/server/s3Storage';
import { collectAccountFiles, deleteAccountData } from '$lib/server/accountDeletion';
import { cacheDel, CACHE_KEY } from '$lib/server/cache';

export const DELETE: RequestHandler = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) error(401, 'Not authenticated');

	const userId = currentUser.id;

	const { buckets, deletedOrgIds } = await event.locals.withRLS(async (tx: Db) => {
		const inTx = <T>(fn: (db: Db) => T) => Promise.resolve(fn(tx));

		const files = await collectAccountFiles(tx, userId);
		const keysByOrg = new Map<string | null, string[]>();
		for (const f of files) keysByOrg.set(f.orgId, [...(keysByOrg.get(f.orgId) ?? []), f.key]);

		const buckets: { config: UserS3Config; keys: string[] }[] = [];
		for (const [orgId, keys] of keysByOrg) {
			const config = await (
				orgId ? getDecryptedOrgS3Config(orgId, inTx) : getDecryptedUserS3Config(userId, inTx)
			).catch(() => null);
			if (config) buckets.push({ config, keys });
		}

		const { deletedOrgIds } = await deleteAccountData(tx, userId);
		return { buckets, deletedOrgIds };
	});

	await Promise.allSettled([
		cacheDel(CACHE_KEY.userS3(userId)),
		...deletedOrgIds.map((id) => cacheDel(CACHE_KEY.orgS3(id)))
	]);

	// Better Auth tables have no RLS.
	await db.delete(authUser).where(eq(authUser.id, userId));

	await Promise.allSettled(
		buckets.flatMap(({ config, keys }) => keys.map((k) => deleteFileWithConfig(config, k)))
	);

	// Better Auth prefixes its cookies with "scholio" (auth-options.ts).
	for (const name of ['scholio.session_token', 'scholio.session_data', 'scholio.dont_remember']) {
		event.cookies.delete(name, { path: '/' });
		event.cookies.delete(`__Secure-${name}`, { path: '/' });
	}

	return json({ ok: true });
};
