import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadFile, deleteFile } from '$lib/server/storage';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq, and } from 'drizzle-orm';

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_TYPES = [
	'text/csv',
	'text/tab-separated-values',
	'application/json',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const ALLOWED_EXTENSIONS = ['csv', 'tsv', 'json', 'xls', 'xlsx'];

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
		rdb.select().from(projectDataset).where(eq(projectDataset.projectId, projectId))
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

	if (!ALLOWED_TYPES.includes(file.type) && !hasAllowedExtension(file.name)) {
		error(400, 'Tipo no permitido. Se aceptan CSV, TSV, JSON, XLS, XLSX.');
	}

	if (file.size > MAX_SIZE) error(400, 'Archivo demasiado grande. Máximo 100 MB.');

	// Keep original filename in the key so $ref by name is human-readable
	const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const key = `projects/${projectId}/datasets/${crypto.randomUUID()}/${safeName}`;

	const buffer = Buffer.from(await file.arrayBuffer());
	const url = await uploadFile(key, buffer, file.type || 'application/octet-stream');

	const [dataset] = await event.locals.withRLS((rdb) =>
		rdb
			.insert(projectDataset)
			.values({
				id: crypto.randomUUID(),
				projectId,
				uploadedBy: user.id,
				key,
				url,
				filename: file.name,
				mimeType: file.type || 'application/octet-stream',
				size: file.size
			})
			.returning()
	);

	return json(dataset, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const datasetId = event.url.searchParams.get('datasetId');
	if (!datasetId) error(400, 'datasetId requerido');

	const projectId = event.params.id;

	const [dataset] = await event.locals.withRLS((rdb) =>
		rdb
			.select()
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

	await deleteFile(dataset.key);
	await event.locals.withRLS((rdb) =>
		rdb.delete(projectDataset).where(eq(projectDataset.id, datasetId))
	);

	return json({ ok: true });
};
