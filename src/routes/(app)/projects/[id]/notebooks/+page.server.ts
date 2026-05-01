import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectNotebook } from '$lib/server/db/schemas/notebooks.schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;

	const [proj, notebooks] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(projectNotebook)
				.where(eq(projectNotebook.projectId, projectId))
				.orderBy(desc(projectNotebook.createdAt))
		)
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	return { project: proj[0], notebooks };
};
