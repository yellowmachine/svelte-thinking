import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and } from 'drizzle-orm';
import { projectNotebook } from '$lib/server/db/schemas/notebooks.schema';

export const DELETE: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	const { notebookId } = event.params;

	const rows = await event.locals.withRLS((db) =>
		db
			.delete(projectNotebook)
			.where(eq(projectNotebook.id, notebookId))
			.returning({ id: projectNotebook.id })
	) as { id: string }[];

	if (!rows[0]) error(404, 'Notebook not found');

	return json({ id: rows[0].id });
};
