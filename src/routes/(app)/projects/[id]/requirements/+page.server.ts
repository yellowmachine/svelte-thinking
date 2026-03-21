import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { eq, asc, desc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, requirements, documents] = await Promise.all([
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
				.from(projectRequirement)
				.where(eq(projectRequirement.projectId, projectId))
				.orderBy(asc(projectRequirement.order))
		),
		event.locals.withRLS((db) =>
			db
				.select({ id: document.id, title: document.title, type: document.type })
				.from(document)
				.where(eq(document.projectId, projectId))
				.orderBy(desc(document.updatedAt))
		)
	]);

	const p = (proj as { id: string; title: string; ownerId: string }[])[0];
	if (!p) error(404, 'Proyecto no encontrado');

	return {
		project: p,
		isOwner: p.ownerId === userId,
		requirements: requirements as (typeof projectRequirement.$inferSelect)[],
		documents: documents as { id: string; title: string; type: string }[]
	};
};
