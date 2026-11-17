/**
 * DELETE /api/account/delete
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Only with a session started in the last few minutes (403 reauth_required
 * otherwise), so the user has just proved again who they are.
 *
 *   1. Scholio data, inside one RLS transaction as the user (deleteAccountData).
 *      Projects in other people's organizations go to the organization's owner.
 *      Before deleting, the same transaction reads the credentials of each
 *      bucket the files live in: afterwards the user's S3 config, the
 *      organizations they owned and their memberships are gone.
 *   2. Better Auth records (session, account, user), in the same transaction —
 *      deleting the user row cascades to session and account via their FK.
 *   3. A confirmation email and the files, each in its own bucket: best-effort,
 *      once the data is gone.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import type { Db } from '$lib/server/db';
import { user as authUser } from '$lib/server/db/auth.schema';
import { deleteFileWithConfig, type UserS3Config } from '$lib/server/storage';
import { getDecryptedUserS3Config, getDecryptedOrgS3Config } from '$lib/server/s3Storage';
import { deleteAccountData, type AccountDeletionResult } from '$lib/server/accountDeletion';
import { sendAccountDeletedEmail } from '$lib/server/email';
import { cacheDel, CACHE_KEY } from '$lib/server/cache';
import { isSessionFresh, REAUTH_REQUIRED } from '$lib/server/freshSession';

export const DELETE: RequestHandler = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) error(401, 'Not authenticated');

	// A session started a moment ago, not just a valid one: see freshSession.ts.
	if (!isSessionFresh(event.locals.session)) {
		return json(
			{ code: REAUTH_REQUIRED, message: 'Sign in again to delete your account.' },
			{ status: 403 }
		);
	}

	const userId = currentUser.id;

	const buckets: { config: UserS3Config; keys: string[] }[] = [];
	let result: AccountDeletionResult;
	try {
		// One transaction for Scholio's data and Better Auth's: all of it goes, or
		// none, so a failure can't leave a user without a profile, stuck on /no-access.
		result = await event.locals.withRLS(async (tx: Db) => {
			const deleted = await deleteAccountData(tx, userId, async (files) => {
				const inTx = <T>(fn: (db: Db) => T) => Promise.resolve(fn(tx));
				const keysByOrg = new Map<string | null, string[]>();
				for (const f of files) keysByOrg.set(f.orgId, [...(keysByOrg.get(f.orgId) ?? []), f.key]);

				for (const [orgId, keys] of keysByOrg) {
					const config = await (
						orgId ? getDecryptedOrgS3Config(orgId, inTx) : getDecryptedUserS3Config(userId, inTx)
					).catch(() => null);
					if (config) buckets.push({ config, keys });
				}
			});
			// Better Auth tables have no RLS; session and account go by cascade.
			await tx.delete(authUser).where(eq(authUser.id, userId));
			return deleted;
		});
	} catch (e) {
		console.error('[account/delete] rolled back', e);
		return json(
			{ message: "Your account couldn't be deleted. Nothing was changed; try again later." },
			{ status: 500 }
		);
	}

	await Promise.allSettled([
		cacheDel(CACHE_KEY.userS3(userId)),
		...result.deletedOrgIds.map((id) => cacheDel(CACHE_KEY.orgS3(id)))
	]);

	// Best-effort: the account is gone either way.
	await sendAccountDeletedEmail({
		to: currentUser.email,
		name: currentUser.name,
		deletedProjects: result.deletedProjects,
		handedOverProjects: result.handedOverProjectIds.length
	}).catch((e) => console.error('[account/delete] confirmation email failed', e));

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
