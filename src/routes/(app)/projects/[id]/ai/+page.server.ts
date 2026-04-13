import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { aiConversation } from '$lib/server/db/schemas/ai.schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;

	const userId = event.locals.user!.id;

	const proj = await event.locals.withRLS((db) =>
		db.select({ id: project.id, title: project.title, ownerId: project.ownerId, agentSystemPrompt: project.agentSystemPrompt })
			.from(project)
			.where(eq(project.id, projectId))
			.limit(1)
			.then((r) => r)
	);

	if (!proj?.[0]) error(404, 'Proyecto no encontrado');

	const conversations = await event.locals.withRLS((db) =>
		db.select()
			.from(aiConversation)
			.where(eq(aiConversation.projectId, projectId))
			.orderBy(desc(aiConversation.updatedAt))
			.then((r) => r)
	);

	return {
		project: proj[0],
		conversations: conversations ?? [],
		isOwner: proj[0].ownerId === userId
	};
};
