import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { issue } from '$lib/server/db/schemas/issues.schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, issues] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title, ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(issue)
				.where(eq(issue.projectId, projectId))
				.orderBy(asc(issue.createdAt))
		)
	]);

	const p = proj[0];
	if (!p) error(404, 'Proyecto no encontrado');

	return {
		project: p,
		issues,
		isOwner: p.ownerId === userId,
		currentUserId: userId
	};
};
