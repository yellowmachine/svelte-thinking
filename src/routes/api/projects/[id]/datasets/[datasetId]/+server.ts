import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401);

	const [dataset] = await event.locals.withRLS((db) =>
		db
			.select({ content: projectDataset.content, mimeType: projectDataset.mimeType })
			.from(projectDataset)
			.where(
				and(
					eq(projectDataset.id, event.params.datasetId),
					eq(projectDataset.projectId, event.params.id)
				)
			)
			.limit(1)
	);
	if (!dataset) error(404);

	return new Response(dataset.content, {
		headers: {
			'Content-Type': dataset.mimeType,
			'Cache-Control': 'private, max-age=300'
		}
	});
};
