/**
 * Deletes a project right now, together with the photos stored for it.
 *
 * Only the owner can do it: the DELETE filters by owner and RLS checks the same.
 * Files are removed only after the row is really gone, so a refused delete
 * never leaves a project pointing at missing photos.
 *
 * Reference PDFs are not touched: references belong to the user's library and
 * stay there (and may be linked to other projects) after the project is gone.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { deleteFileWithConfig } from '$lib/server/storage';

type WithRLS = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export async function deleteProjectNow(
	withRLS: WithRLS,
	projectId: string,
	ownerId: string
): Promise<{ id: string; title: string } | null> {
	// Resolve storage while the project still exists: it tells personal from org storage.
	const s3 = await resolveProjectS3Config(projectId, ownerId, withRLS).catch(() => null);

	const { deleted, photoKeys } = await withRLS(async (db) => {
		const photos = await db
			.select({ key: projectPhoto.key })
			.from(projectPhoto)
			.where(eq(projectPhoto.projectId, projectId));
		const rows = await db
			.delete(project)
			.where(and(eq(project.id, projectId), eq(project.ownerId, ownerId)))
			.returning({ id: project.id, title: project.title });
		return { deleted: rows[0] ?? null, photoKeys: photos.map((p) => p.key) };
	});

	if (deleted && s3 && photoKeys.length > 0) {
		await Promise.allSettled(photoKeys.map((key) => deleteFileWithConfig(s3, key)));
	}

	return deleted;
}
