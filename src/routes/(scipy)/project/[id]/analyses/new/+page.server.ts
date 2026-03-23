import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';
import { projectTemplate } from '$lib/server/db/schemas/templates.schema';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const templateId = event.url.searchParams.get('templateId');

	const [proj, datasets] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select({ id: projectDataset.id, filename: projectDataset.filename, mimeType: projectDataset.mimeType })
				.from(projectDataset)
				.where(eq(projectDataset.projectId, projectId))
				.orderBy(desc(projectDataset.createdAt))
		)
	]);

	if (!proj[0]) error(404, 'Project not found');
	if (datasets.length === 0) error(400, 'Upload at least one dataset before running an analysis');

	// Pre-fill from template if provided
	let template = null;
	if (templateId) {
		const [tpl] = await event.locals.withRLS((db) =>
			db.select().from(projectTemplate).where(eq(projectTemplate.id, templateId)).limit(1)
		);
		template = tpl ?? null;
	}

	return { project: proj[0], datasets, template };
};
