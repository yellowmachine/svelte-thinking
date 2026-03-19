import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Token de verificación no encontrado');

	try {
		await auth.api.verifyEmail({ query: { token } });
	} catch {
		error(400, 'El enlace de verificación es inválido o ha expirado');
	}

	redirect(302, '/projects');
};
