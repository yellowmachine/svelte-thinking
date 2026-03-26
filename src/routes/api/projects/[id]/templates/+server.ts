import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectTemplate } from '$lib/server/db/schemas/templates.schema';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	const projectId = event.params.id;
	const [proj] = await event.locals.withRLS((db) =>
		db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Project not found');

	const templates = await event.locals.withRLS((db) =>
		db.select().from(projectTemplate).where(eq(projectTemplate.projectId, projectId))
	);

	return json(templates);
};

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'Unauthorized');

	const projectId = event.params.id;
	const [proj] = await event.locals.withRLS((db) =>
		db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Project not found');

	const body = await event.request.json();
	const { name, description, type, parameters, isPublic } = body;

	if (!name || !type) error(400, 'name and type are required');

	const [template] = await event.locals.withRLS((db) =>
		db
			.insert(projectTemplate)
			.values({
				id: crypto.randomUUID(),
				projectId,
				name,
				description: description ?? null,
				type,
				parameters: parameters ?? {},
				isPublic: isPublic ?? false,
				createdBy: user.id
			})
			.returning()
	);

	return json(template, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'Unauthorized');

	const templateId = event.url.searchParams.get('templateId');
	if (!templateId) error(400, 'templateId required');

	const projectId = event.params.id;
	const [template] = await event.locals.withRLS((db) =>
		db
			.select()
			.from(projectTemplate)
			.where(
				and(
					eq(projectTemplate.id, templateId),
					eq(projectTemplate.projectId, projectId),
					eq(projectTemplate.createdBy, user.id)
				)
			)
			.limit(1)
	);
	if (!template) error(404, 'Template not found');

	await event.locals.withRLS((db) =>
		db.delete(projectTemplate).where(eq(projectTemplate.id, templateId))
	);

	return json({ ok: true });
};
