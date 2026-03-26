import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, datasets] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select({ id: project.id, title: project.title, ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db.select()
				.from(projectDataset)
				.where(eq(projectDataset.projectId, projectId))
				.orderBy(desc(projectDataset.createdAt))
		)
	]);

	if (!proj[0]) error(404, 'Project not found');

	return {
		project: {
			id: proj[0].id,
			title: proj[0].title,
			isOwner: proj[0].ownerId === userId
		},
		datasets,
		userId
	};
};
