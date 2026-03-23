import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectTemplate } from '$lib/server/db/schemas/templates.schema';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;

	const [proj, templates] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db.select().from(projectTemplate).where(eq(projectTemplate.projectId, projectId))
		)
	]);

	if (!proj[0]) error(404, 'Project not found');

	return { project: proj[0], templates, userId: event.locals.user!.id };
};
