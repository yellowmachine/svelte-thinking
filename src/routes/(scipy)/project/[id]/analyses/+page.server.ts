import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectAnalysis } from '$lib/server/db/schemas/analyses.schema';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;

	const [proj, analyses] = await Promise.all([
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
				.from(projectAnalysis)
				.where(eq(projectAnalysis.projectId, projectId))
				.orderBy(desc(projectAnalysis.createdAt))
		)
	]);

	if (!proj[0]) error(404, 'Project not found');

	return { project: proj[0], analyses };
};
