import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectNotebook } from '$lib/server/db/schemas/notebooks.schema';
import { eq } from 'drizzle-orm';
import { parseNotebook, getContentCells } from '$lib/utils/jupyter';

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	const projectId = event.params.id;

	const [proj] = await event.locals.withRLS((db) =>
		db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Project not found');

	const notebooks = await event.locals.withRLS((db) =>
		db
			.select()
			.from(projectNotebook)
			.where(eq(projectNotebook.projectId, projectId))
	);

	return json(notebooks);
};

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'Unauthorized');

	const projectId = event.params.id;

	const [proj] = await event.locals.withRLS((db) =>
		db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Project not found');

	const formData = await event.request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'No file received');

	if (!file.name.endsWith('.ipynb')) {
		error(400, 'Only .ipynb files are supported');
	}

	if (file.size > MAX_SIZE) {
		error(400, 'File too large (max 50 MB)');
	}

	let raw: unknown;
	try {
		const text = await file.text();
		raw = JSON.parse(text);
	} catch {
		error(400, 'Invalid file: could not parse JSON');
	}

	let notebook;
	try {
		notebook = parseNotebook(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to parse notebook';
		error(422, message);
	}

	const cells = getContentCells(notebook);

	const [saved] = await event.locals.withRLS((db) =>
		db
			.insert(projectNotebook)
			.values({
				id: crypto.randomUUID(),
				projectId,
				importedBy: user.id,
				filename: file.name,
				size: file.size,
				source: 'file',
				kernelName: notebook.metadata.kernelName ?? null,
				languageName: notebook.metadata.languageName ?? null,
				cells
			})
			.returning()
	);

	return json(saved, { status: 201 });
};
