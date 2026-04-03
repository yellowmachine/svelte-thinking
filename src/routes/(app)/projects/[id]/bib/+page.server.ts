import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;

	const [proj, references] = await Promise.all([
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
				.from(projectReference)
				.where(eq(projectReference.projectId, projectId))
				.orderBy(asc(projectReference.citeKey))
		)
	]);

	if (!(proj as { id: string }[])[0]) error(404, 'Proyecto no encontrado');

	return {
		project: (proj as { id: string; title: string }[])[0],
		references: references as (typeof projectReference.$inferSelect)[]
	};
};
