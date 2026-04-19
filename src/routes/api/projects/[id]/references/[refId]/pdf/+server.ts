import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and } from 'drizzle-orm';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { uploadFileWithConfig, deleteFileWithConfig } from '$lib/server/storage';

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401);

	const { id: projectId, refId } = event.params;

	const [ref] = await event.locals.withRLS((db) =>
		db
			.select({ id: reference.id, pdfKey: reference.pdfKey })
			.from(reference)
			.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
			.where(and(eq(reference.id, refId), eq(projectReference.projectId, projectId)))
			.limit(1)
	);
	if (!ref) error(404);

	const formData = await event.request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'No file received');
	if (!file.name.toLowerCase().endsWith('.pdf')) error(400, 'Only PDF files are accepted');
	if (file.size > MAX_SIZE) error(400, 'File too large (max 50 MB)');

	const s3 = await resolveProjectS3Config(projectId, user.id, event.locals.withRLS);
	if (!s3) error(422, 'S3 storage not configured. Configure it in Settings → Storage.');

	if (ref.pdfKey) {
		await deleteFileWithConfig(s3, ref.pdfKey).catch(() => {});
	}

	const key = `projects/${projectId}/references/${refId}/paper.pdf`;
	const url = await uploadFileWithConfig(s3, key, Buffer.from(await file.arrayBuffer()), 'application/pdf');

	await event.locals.withRLS((db) =>
		db
			.update(reference)
			.set({ pdfKey: key, pdfUrl: url })
			.where(eq(reference.id, refId))
	);

	return json({ ok: true, url: `/api/references/${refId}/pdf` });
};

export const DELETE: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401);

	const { id: projectId, refId } = event.params;

	const [ref] = await event.locals.withRLS((db) =>
		db
			.select({ id: reference.id, pdfKey: reference.pdfKey })
			.from(reference)
			.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
			.where(and(eq(reference.id, refId), eq(projectReference.projectId, projectId)))
			.limit(1)
	);
	if (!ref) error(404);
	if (!ref.pdfKey) error(404, 'No PDF attached');

	const s3 = await resolveProjectS3Config(projectId, user.id, event.locals.withRLS);
	if (!s3) error(422, 'S3 storage not configured.');

	await deleteFileWithConfig(s3, ref.pdfKey).catch(() => {});

	await event.locals.withRLS((db) =>
		db
			.update(reference)
			.set({ pdfKey: null, pdfUrl: null })
			.where(eq(reference.id, refId))
	);

	return json({ ok: true });
};
