import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadFileWithConfig } from '$lib/server/storage';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { storeEphemeral } from '$lib/server/ephemeralStore';
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

	const arrayBuffer = await file.arrayBuffer();
	const buffer = new Uint8Array(arrayBuffer);

	const s3 = await resolveProjectS3Config(projectId, user.id, event.locals.withRLS).catch(
		() => null
	);

	if (s3) {
		const key = `projects/${projectId}/epub/${crypto.randomUUID()}.epub`;
		const url = await uploadFileWithConfig(s3, key, Buffer.from(buffer), 'application/epub+zip');
		return json({ url }, { status: 201 });
	}

	const url = storeEphemeral(buffer);
	return json({ url }, { status: 201 });
};
