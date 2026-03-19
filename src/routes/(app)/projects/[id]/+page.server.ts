import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { eq, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, documents, collaborators, invitations] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select().from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(document)
				.where(eq(document.projectId, projectId))
				.orderBy(desc(document.updatedAt))
		),
		event.locals.withRLS((db) =>
			db.select().from(projectCollaborator).where(eq(projectCollaborator.projectId, projectId))
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(projectInvitation)
				.where(
					and(eq(projectInvitation.projectId, projectId), eq(projectInvitation.status, 'pending'))
				)
				.orderBy(desc(projectInvitation.createdAt))
		)
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	const myRole = collaborators.find((c) => c.userId === userId)?.role ?? null;

	return {
		project: proj[0],
		documents,
		collaborators,
		invitations,
		myRole,
		isOwner: proj[0].ownerId === userId
	};
};
