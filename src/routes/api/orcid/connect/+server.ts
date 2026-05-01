import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user) redirect(302, '/login');

	const state = crypto.randomUUID();
	cookies.set('orcid_state', state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600
	});

	const baseUrl = env.ORCID_BASE_URL ?? 'https://sandbox.orcid.org';
	const params = new URLSearchParams({
		client_id: env.ORCID_CLIENT_ID ?? '',
		response_type: 'code',
		scope: '/authenticate',
		redirect_uri: env.ORCID_REDIRECT_URI ?? '',
		state
	});

	redirect(302, `${baseUrl}/oauth/authorize?${params}`);
};
