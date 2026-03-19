import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadFile } from '$lib/server/storage';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq } from 'drizzle-orm';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const projectId = event.params.id;

	// Verify user has access to the project
	const [proj] = await event.locals.withRLS((rdb) =>
		rdb.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Proyecto no encontrado');

	const formData = await event.request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'No se recibió ningún archivo');

	if (!ALLOWED_TYPES.includes(file.type)) {
		error(400, 'Tipo de archivo no permitido. Solo se permiten imágenes.');
	}

	if (file.size > MAX_SIZE) {
		error(400, 'El archivo es demasiado grande. Máximo 10 MB.');
	}

	const description = formData.get('description');

	const ext = file.name.split('.').pop() ?? 'jpg';
	const key = `projects/${projectId}/photos/${crypto.randomUUID()}.${ext}`;

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const url = await uploadFile(key, buffer, file.type);

	const id = crypto.randomUUID();
	const [photo] = await event.locals.withRLS((rdb) =>
		rdb
			.insert(projectPhoto)
			.values({
				id,
				projectId,
				uploadedBy: user.id,
				key,
				url,
				filename: file.name,
				mimeType: file.type,
				size: file.size,
				description: typeof description === 'string' && description ? description : null
			})
			.returning()
	);

	return json(photo, { status: 201 });
};
