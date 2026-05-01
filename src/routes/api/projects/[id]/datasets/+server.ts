import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq, and } from 'drizzle-orm';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ['csv', 'tsv', 'json'];

function hasAllowedExtension(filename: string): boolean {
	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	return ALLOWED_EXTENSIONS.includes(ext);
}

export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const projectId = event.params.id;
	const [proj] = await event.locals.withRLS((rdb) =>
		rdb.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Proyecto no encontrado');

	const datasets = await event.locals.withRLS((rdb) =>
		rdb
			.select({
				id: projectDataset.id,
				projectId: projectDataset.projectId,
				uploadedBy: projectDataset.uploadedBy,
				filename: projectDataset.filename,
				mimeType: projectDataset.mimeType,
				size: projectDataset.size,
				createdAt: projectDataset.createdAt
			})
			.from(projectDataset)
			.where(eq(projectDataset.projectId, projectId))
	);

	return json(datasets);
};

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const projectId = event.params.id;
	const [proj] = await event.locals.withRLS((rdb) =>
		rdb.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
	);
	if (!proj) error(404, 'Proyecto no encontrado');

	const formData = await event.request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'No se recibió ningún archivo');

	if (!hasAllowedExtension(file.name)) {
		error(400, 'Tipo no permitido. Se aceptan CSV, TSV, JSON.');
	}

	if (file.size > MAX_SIZE) error(400, 'Archivo demasiado grande. Máximo 5 MB.');

	const content = await file.text();

	const [dataset] = await event.locals.withRLS((rdb) =>
		rdb
			.insert(projectDataset)
			.values({
				id: crypto.randomUUID(),
				projectId,
				uploadedBy: user.id,
				filename: file.name,
				mimeType: file.type || 'text/plain',
				size: file.size,
				content
			})
			.returning()
	);

	return json(
		{
			id: dataset.id,
			projectId: dataset.projectId,
			uploadedBy: dataset.uploadedBy,
			filename: dataset.filename,
			mimeType: dataset.mimeType,
			size: dataset.size,
			createdAt: dataset.createdAt
		},
		{ status: 201 }
	);
};

export const DELETE: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const datasetId = event.url.searchParams.get('datasetId');
	if (!datasetId) error(400, 'datasetId requerido');

	const projectId = event.params.id;

	const [dataset] = await event.locals.withRLS((rdb) =>
		rdb
			.select({ id: projectDataset.id })
			.from(projectDataset)
			.where(
				and(
					eq(projectDataset.id, datasetId),
					eq(projectDataset.projectId, projectId),
					eq(projectDataset.uploadedBy, user.id)
				)
			)
			.limit(1)
	);
	if (!dataset) error(404, 'Dataset no encontrado');

	await event.locals.withRLS((rdb) =>
		rdb.delete(projectDataset).where(eq(projectDataset.id, datasetId))
	);

	return json({ ok: true });
};
