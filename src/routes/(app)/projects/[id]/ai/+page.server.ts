import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { aiConversation } from '$lib/server/db/schemas/ai.schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;

	const [proj, conversations] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select({ id: project.id, title: project.title })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		) as Promise<{ id: string; title: string }[]>,

		event.locals.withRLS((db) =>
			db.select()
				.from(aiConversation)
				.where(eq(aiConversation.projectId, projectId))
				.orderBy(desc(aiConversation.updatedAt))
		) as Promise<(typeof aiConversation.$inferSelect)[]>
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	return { project: proj[0], conversations };
};
