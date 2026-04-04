import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { eq } from 'drizzle-orm';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { getPresignedUrlWithConfig } from '$lib/server/storage';

/**
 * Permanent proxy for photo access.
 * Authenticates the request, confirms project access via RLS, then
 * redirects to a short-lived presigned URL.  This keeps Markdown image
 * links (![img](/api/photos/<id>)) stable regardless of bucket policy.
 */
export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401);

	const [photo] = await event.locals.withRLS((db) =>
		db.select().from(projectPhoto).where(eq(projectPhoto.id, event.params.id)).limit(1)
	);
	if (!photo) error(404);

	const s3 = await resolveProjectS3Config(photo.projectId, user.id, event.locals.withRLS);
	if (!s3) redirect(302, photo.url);

	const presignedUrl = await getPresignedUrlWithConfig(s3, photo.key, 300);
	redirect(302, presignedUrl);
};
