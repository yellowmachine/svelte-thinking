import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projects = await event.locals.withRLS((db) =>
		db
			.select({
				id: project.id,
				title: project.title,
				description: project.description,
				status: project.status,
				updatedAt: project.updatedAt,
				collaboratorCount:
					sql<number>`(SELECT COUNT(*)::int FROM project_collaborator WHERE project_collaborator.project_id = ${project.id})`.as(
						'collaborator_count'
					)
			})
			.from(project)
			.orderBy(desc(project.updatedAt))
	);

	return { projects };
};
