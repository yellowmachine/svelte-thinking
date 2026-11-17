import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { safeRedirectPath } from '$lib/utils/safeRedirect';

export const POST: RequestHandler = async (event) => {
	await auth.api.signOut({ headers: event.request.headers });
	// Optional `redirect` field: where to go next, e.g. the login page to sign in again.
	const data = await event.request.formData().catch(() => null);
	redirect(302, safeRedirectPath(data?.get('redirect')?.toString(), '/'));
};
