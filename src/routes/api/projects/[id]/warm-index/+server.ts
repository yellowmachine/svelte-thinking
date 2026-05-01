import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { buildProjectIndex } from '$lib/server/trpc/routers/ai';

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	const projectId = event.params.id;
	const [proj] = (await event.locals.withRLS((db) =>
		db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	)) as { id: string }[];
	if (!proj) error(404, 'Project not found');

	// Fire-and-forget: build and cache the index without blocking the response
	buildProjectIndex(event.locals.withRLS, projectId).catch(() => {});

	return json({ ok: true });
};
