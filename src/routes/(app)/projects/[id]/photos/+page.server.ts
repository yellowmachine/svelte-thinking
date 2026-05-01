import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { eq, desc } from 'drizzle-orm';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { getPresignedUrlWithConfig } from '$lib/server/storage';
import { cacheGet, cacheSet, CACHE_KEY, TTL } from '$lib/server/cache';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, rawPhotos] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select().from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(projectPhoto)
				.where(eq(projectPhoto.projectId, projectId))
				.orderBy(desc(projectPhoto.createdAt))
		)
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	const s3 = await resolveProjectS3Config(projectId, userId, event.locals.withRLS).catch(
		() => null
	);

	const photos = await Promise.all(
		rawPhotos.map(async (photo) => {
			if (!s3) return { ...photo, presignedUrl: photo.url };

			const cacheKey = CACHE_KEY.photoPresign(photo.id);
			const cached = await cacheGet<string>(cacheKey);
			if (cached) return { ...photo, presignedUrl: cached };

			const presignedUrl = await getPresignedUrlWithConfig(s3, photo.key, 3600);
			await cacheSet(cacheKey, presignedUrl, TTL.photoPresign);
			return { ...photo, presignedUrl };
		})
	);

	return {
		project: proj[0],
		photos,
		currentUserId: userId
	};
};
