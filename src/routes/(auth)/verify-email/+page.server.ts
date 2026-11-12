import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Verification token not found');

	try {
		await auth.api.verifyEmail({ query: { token } });
	} catch {
		error(400, 'This verification link is invalid or has expired');
	}

	redirect(302, '/projects');
};
