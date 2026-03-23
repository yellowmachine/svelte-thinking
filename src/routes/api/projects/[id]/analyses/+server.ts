import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';
import { projectAnalysis } from '$lib/server/db/schemas/analyses.schema';
import { scipy, datasetRef, ScipyError } from '$lib/server/scipy';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	const projectId = event.params.id;
	const [proj] = await event.locals.withRLS((db) =>
		db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Project not found');

	const analyses = await event.locals.withRLS((db) =>
		db
			.select()
			.from(projectAnalysis)
			.where(eq(projectAnalysis.projectId, projectId))
	);

	return json(analyses);
};

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'Unauthorized');

	const projectId = event.params.id;
	const body = await event.request.json();
	const { datasetId, type, parameters } = body;

	if (!datasetId || !type) error(400, 'datasetId and type are required');

	// Verify project access and get dataset in parallel
	const [[proj], [dataset]] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(projectDataset)
				.where(eq(projectDataset.id, datasetId))
				.limit(1)
		)
	]);

	if (!proj) error(404, 'Project not found');
	if (!dataset) error(404, 'Dataset not found');

	// Insert analysis record as 'running'
	const [analysis] = await event.locals.withRLS((db) =>
		db
			.insert(projectAnalysis)
			.values({
				id: crypto.randomUUID(),
				projectId,
				datasetId,
				type,
				parameters: parameters ?? {},
				status: 'running',
				createdBy: user.id
			})
			.returning()
	);

	// Call scipy microservice
	const ref = datasetRef(dataset);
	let result: unknown;

	try {
		if (type === 'describe') {
			result = await scipy.describe(ref, parameters?.columns);
		} else if (type === 'ttest') {
			result = await scipy.ttest(ref, parameters);
		} else {
			error(400, `Unknown analysis type: ${type}`);
		}

		// Update with result
		const [updated] = await event.locals.withRLS((db) =>
			db
				.update(projectAnalysis)
				.set({ status: 'completed', result })
				.where(eq(projectAnalysis.id, analysis.id))
				.returning()
		);

		return json(updated, { status: 201 });
	} catch (err) {
		const message = err instanceof ScipyError ? err.message : 'Analysis failed';

		await event.locals.withRLS((db) =>
			db
				.update(projectAnalysis)
				.set({ status: 'failed', errorMessage: message })
				.where(eq(projectAnalysis.id, analysis.id))
		);

		error(502, message);
	}
};
