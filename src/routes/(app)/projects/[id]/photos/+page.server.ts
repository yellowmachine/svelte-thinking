import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, photos] = await Promise.all([
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

	return {
		project: proj[0],
		photos,
		currentUserId: userId
	};
};
