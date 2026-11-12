/**
 * DELETE /api/account/delete
 *
 * Permanently deletes the authenticated user's account and all associated data:
 *   1. Scholio data, inside one RLS transaction as the user (deleteAccountData)
 *   2. Better Auth records (session, account, user) — deleting the user row
 *      cascades to session and account via Better Auth's FK.
 *   3. Files in the user's own bucket, best-effort, once the data is gone.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as authUser } from '$lib/server/db/auth.schema';
import { deleteFileWithConfig } from '$lib/server/storage';
import { getDecryptedUserS3Config } from '$lib/server/s3Storage';
import { deleteAccountData } from '$lib/server/accountDeletion';
import { cacheDel, CACHE_KEY } from '$lib/server/cache';

export const DELETE: RequestHandler = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) error(401, 'Not authenticated');

	const userId = currentUser.id;
	const withRLS = event.locals.withRLS;

	// Read the bucket credentials before the row that holds them is deleted.
	const s3Config = await getDecryptedUserS3Config(userId, withRLS).catch(() => null);

	const { storageKeys } = await withRLS((tx) => deleteAccountData(tx, userId));
	await cacheDel(CACHE_KEY.userS3(userId)).catch(() => {});

	// Better Auth tables have no RLS.
	await db.delete(authUser).where(eq(authUser.id, userId));

	if (s3Config && storageKeys.length > 0) {
		await Promise.allSettled(storageKeys.map((k) => deleteFileWithConfig(s3Config, k)));
	}

	// Better Auth prefixes its cookies with "scholio" (auth-options.ts).
	for (const name of ['scholio.session_token', 'scholio.session_data', 'scholio.dont_remember']) {
		event.cookies.delete(name, { path: '/' });
		event.cookies.delete(`__Secure-${name}`, { path: '/' });
	}

	return json({ ok: true });
};
