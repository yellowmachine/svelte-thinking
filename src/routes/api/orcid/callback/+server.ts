import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('orcid_state');

	cookies.delete('orcid_state', { path: '/' });

	if (!locals.user) redirect(302, '/login');

	if (!code || !storedState || state !== storedState) {
		redirect(302, '/settings?tab=profile&orcid=error');
	}

	let orcidId: string;
	try {
		const baseUrl = env.ORCID_BASE_URL ?? 'https://sandbox.orcid.org';
		const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json'
			},
			body: new URLSearchParams({
				client_id: env.ORCID_CLIENT_ID ?? '',
				client_secret: env.ORCID_CLIENT_SECRET ?? '',
				grant_type: 'authorization_code',
				code,
				redirect_uri: env.ORCID_REDIRECT_URI ?? ''
			})
		});

		if (!tokenRes.ok) throw new Error(`ORCID token error: ${tokenRes.status}`);

		const tokenData = (await tokenRes.json()) as { orcid: string };
		orcidId = tokenData.orcid;
	} catch {
		redirect(302, '/settings?tab=profile&orcid=error');
	}

	await db
		.update(userProfile)
		.set({ orcid: orcidId, orcidVerified: true, updatedAt: new Date() })
		.where(eq(userProfile.userId, locals.user.id));

	redirect(302, '/settings?tab=profile&orcid=connected');
};
