import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { eq } from 'drizzle-orm';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { createS3Client } from '$lib/server/storage';

/**
 * Permanent streaming proxy for photo access.
 * Authenticates the request, confirms project access via RLS, then
 * fetches the object from S3 server-side and streams it back.
 *
 * Streaming (not redirect) is required so the browser only ever makes
 * a request to 'self', satisfying the img-src CSP directive.
 */
export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401);

	const [photo] = await event.locals.withRLS((db) =>
		db.select().from(projectPhoto).where(eq(projectPhoto.id, event.params.id)).limit(1)
	);
	if (!photo) error(404);

	const s3 = await resolveProjectS3Config(photo.projectId, user.id, event.locals.withRLS);
	if (!s3) {
		// No S3 config — redirect to stored public URL (public bucket fallback)
		return Response.redirect(photo.url);
	}

	const client = createS3Client(s3);
	const response = await client.send(
		new GetObjectCommand({ Bucket: s3.bucket, Key: photo.key })
	);

	if (!response.Body) error(502, 'Empty response from S3');

	const bytes = await (
		response.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }
	).transformToByteArray();

	return new Response(bytes.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': photo.mimeType,
			'Cache-Control': 'private, max-age=3600',
			'Content-Length': String(bytes.byteLength)
		}
	});
};
