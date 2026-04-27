import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { createS3Client } from '$lib/server/storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401);

	const [ref] = await event.locals.withRLS((db) =>
		db
			.select({
				projectId: projectReference.projectId,
				pdfKey: reference.pdfKey
			})
			.from(reference)
			.leftJoin(projectReference, eq(projectReference.referenceId, reference.id))
			.where(eq(reference.id, event.params.refId))
			.limit(1)
	);
	if (!ref || !ref.pdfKey) error(404);

	const s3 = ref.projectId
		? await resolveProjectS3Config(ref.projectId, event.locals.user.id, event.locals.withRLS)
		: null;
	if (!s3) error(422);

	const client = createS3Client(s3);
	const response = await client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: ref.pdfKey }));
	if (!response.Body) error(502);

	const bytes = await (
		response.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }
	).transformToByteArray();

	return new Response(bytes.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Cache-Control': 'private, max-age=3600',
			'Content-Disposition': 'inline'
		}
	});
};
