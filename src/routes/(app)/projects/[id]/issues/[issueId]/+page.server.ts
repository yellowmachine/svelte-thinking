import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { issue } from '$lib/server/db/schemas/issues.schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const { id: projectId, issueId } = event.params;
	const userId = event.locals.user!.id;

	const [proj, issueRows] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title, ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db.select().from(issue).where(eq(issue.id, issueId)).limit(1)
		)
	]);

	const p = proj[0];
	if (!p) error(404, 'Proyecto no encontrado');

	const iss = issueRows[0];
	if (!iss) error(404, 'Issue no encontrado');

	return {
		issue: iss,
		projectTitle: p.title,
		projectId,
		isOwner: p.ownerId === userId,
		canEdit: p.ownerId === userId || iss.ownerUserId === userId,
		currentUserId: userId
	};
};
