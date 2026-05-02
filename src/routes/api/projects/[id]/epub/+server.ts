import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processEpubImport } from '$lib/server/epubImport';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq } from 'drizzle-orm';

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_TYPES = ['application/epub+zip', 'application/zip'];

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const projectId = event.params.id;

	const [proj] = await event.locals.withRLS((rdb) =>
		rdb.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Project not found.');

	const formData = await event.request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'No file was received.');

	if (!file.name.endsWith('.epub') && !ALLOWED_TYPES.includes(file.type)) {
		error(400, 'Only .epub files are allowed.');
	}

	if (file.size > MAX_SIZE) {
		error(400, 'The file is too large. Maximum 100 MB.');
	}

	const buffer = new Uint8Array(await file.arrayBuffer());

	const referenceIdRaw = formData.get('referenceId');
	const referenceId = typeof referenceIdRaw === 'string' ? referenceIdRaw : undefined;

	processEpubImport({
		projectId,
		userId: user.id,
		withRLS: event.locals.withRLS,
		buffer,
		referenceId
	});

	return json({ started: true }, { status: 202 });
};
