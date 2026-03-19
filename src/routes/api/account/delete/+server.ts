/**
 * DELETE /api/account/delete
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Deletion order:
 *   1. MinIO files (photos + datasets from owned projects)
 *   2. Owned projects → cascade deletes documents, versions, comments,
 *      collaborators, ai conversations, photos, datasets
 *   3. Collaborator entries in other projects
 *   4. user_profile, user_ai_config
 *   5. Better Auth records (session, account, user) — done by deleting the user row
 *      which cascades to session and account via Better Auth's FK.
 */
import { json, error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { userProfile, userAiConfig } from '$lib/server/db/schemas/users.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';
import { user as authUser, session as authSession } from '$lib/server/db/auth.schema';
import { deleteFile } from '$lib/server/storage';

export const DELETE: RequestHandler = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) error(401, 'No autenticado');

	const userId = currentUser.id;

	// ── 1. Collect MinIO keys from owned projects ────────────────────────────
	const ownedProjects = await db
		.select({ id: project.id })
		.from(project)
		.where(eq(project.ownerId, userId));

	const projectIds = ownedProjects.map((p) => p.id);

	if (projectIds.length > 0) {
		const [photos, datasets] = await Promise.all([
			db
				.select({ key: projectPhoto.key })
				.from(projectPhoto)
				.where(inArray(projectPhoto.projectId, projectIds)),
			db
				.select({ key: projectDataset.key })
				.from(projectDataset)
				.where(inArray(projectDataset.projectId, projectIds))
		]);

		// ── 2. Delete MinIO files (best-effort, don't block on failure) ───────
		await Promise.allSettled([
			...photos.map((f) => deleteFile(f.key)),
			...datasets.map((f) => deleteFile(f.key))
		]);

		// ── 3. Delete owned projects (cascade handles everything under them) ──
		await db.delete(project).where(inArray(project.id, projectIds));
	}

	// ── 4. Remove collaborator entries in other people's projects ────────────
	await db.delete(projectCollaborator).where(eq(projectCollaborator.userId, userId));

	// ── 5. Delete app-level user data (no FK to auth.user) ───────────────────
	await Promise.all([
		db.delete(userProfile).where(eq(userProfile.userId, userId)),
		db.delete(userAiConfig).where(eq(userAiConfig.userId, userId))
	]);

	// ── 6. Delete auth records ────────────────────────────────────────────────
	// Deleting the user row cascades to session + account (Better Auth schema).
	await db.delete(authUser).where(eq(authUser.id, userId));

	// ── 7. Clear session cookie ───────────────────────────────────────────────
	event.cookies.delete('better-auth.session_token', { path: '/' });
	event.cookies.delete('__Secure-better-auth.session_token', { path: '/' });

	return json({ ok: true });
};
