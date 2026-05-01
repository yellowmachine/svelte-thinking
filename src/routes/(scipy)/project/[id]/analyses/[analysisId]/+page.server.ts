import { error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectAnalysis } from '$lib/server/db/schemas/analyses.schema';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';

export const load: PageServerLoad = async (event) => {
	const { id: projectId, analysisId } = event.params;

	const [proj] = await event.locals.withRLS((db) =>
		db
			.select({ id: project.id, title: project.title })
			.from(project)
			.where(eq(project.id, projectId))
			.limit(1)
	);
	if (!proj) error(404, 'Project not found');

	const [analysis] = await event.locals.withRLS((db) =>
		db
			.select()
			.from(projectAnalysis)
			.where(and(eq(projectAnalysis.id, analysisId), eq(projectAnalysis.projectId, projectId)))
			.limit(1)
	);
	if (!analysis) error(404, 'Analysis not found');

	const [dataset] = await event.locals.withRLS((db) =>
		db
			.select({ filename: projectDataset.filename })
			.from(projectDataset)
			.where(eq(projectDataset.id, analysis.datasetId))
			.limit(1)
	);

	return { project: proj, analysis, datasetFilename: dataset?.filename ?? '' };
};
